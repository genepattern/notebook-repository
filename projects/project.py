import json
import os
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, backref, sessionmaker

from projects.zip import zip_dir

Base = declarative_base()


class Project(Base):
    """ORM model representing a published project"""
    __tablename__ = 'projects'

    id = Column(Integer, primary_key=True)
    dir = Column(String(255))

    name = Column(String(255))
    description = Column(String(255), default='')
    author = Column(String(255), default='')
    quality = Column(String(255), default='')

    tags = relationship('Tag', secondary='project_tags', lazy='subquery', backref=backref('projects', lazy=True))

    created = Column(DateTime, default=datetime.utcnow)
    updated = Column(DateTime, default=datetime.utcnow)

    copied = Column(Integer, default=1)

    owner = Column(String(255))
    deleted = Column(Boolean, default=False)

    def __init__(self, spec=None):
        super(Project, self).__init__()                         # Call the superclass constructor
        if spec is None: return                                 # If no spec, nothing left to do

        # If a spec was given, parse it and instantiate this project with the data
        try:
            if isinstance(spec, str): spec = json.loads(spec)   # Parse the JSON, if necessary
            for key in Project.__dict__:                        # Assign attributes from the json
                if key in spec: setattr(self, key, spec[key])
        except json.JSONDecodeError:
            raise Project.SpecError('Error parsing json')

    def exists(self):
        return Project.get(owner=self.owner, dir=self.dir) is not None

    def zip(self):
        if not self.dir or not self.name or not self.author or not self.quality or not self.owner:
            raise Project.SpecError('Missing required attributes')
        project_dir = os.path.join(users_path, self.owner, self.dir)            # Path to the source project
        zip_path = os.path.join(repository_path, self.owner, f'{self.dir}.zip') # Path to the zipped project
        os.makedirs(os.path.dirname(zip_path), mode=0o777, exist_ok=False)      # Lazily create directories
        if os.path.exists(zip_path): os.remove(zip_path)                        # Remove the old copy if one exists
        zip_dir(project_dir, zip_path)                                          # Create the zip file

    def delete_zip(self):
        zip_path = os.path.join(repository_path, self.owner, f'{self.dir}.zip')  # Path to the zipped project
        if os.path.exists(zip_path): os.remove(zip_path)                         # Remove the zip file

    def delete(self):
        self.deleted = True
        self.updated = datetime.now()
        return self.save()

    def save(self):
        # Ensure that the project has all of the required information
        if not self.dir or not self.name or not self.author or not self.quality or not self.owner:
            raise Project.SpecError('Missing required attributes')
        # Save the project to the database and return the json representation
        return Project.put(self)

    def json(self):
        data = { c.name: getattr(self, c.name) for c in self.__table__.columns }
        for k in data:
            if isinstance(data[k], datetime):
                data[k] = str(data[k])
        return data

    class ExistsError(RuntimeError):
        """Error to return if trying to create a project that already exists"""
        pass

    class SpecError(RuntimeError):
        """Error to return if attempting to initialize a project from a bad specification"""
        pass

    class PermissionError(RuntimeError):
        """Error to return if attempting to edit a project you do not own"""
        pass

    @staticmethod
    def get(id=None, owner=None, dir=None):
        session = Session()
        query = session.query(Project)
        if id is not None:      query.filter(Project.id == id)
        if owner is not None:   query.filter(Project.owner == owner)
        if dir is not None:     query.filter(Project.dir == dir)
        project = query.first()
        session.close()
        return project

    @staticmethod
    def put(project):
        session = Session()
        session.add(project)
        session.commit()
        d = project.json()
        session.close()
        return d  # Return the json representation

    @staticmethod
    def get_all(include_deleted=False):
        session = Session()
        query = session.query(Project)
        if include_deleted: results = query.all()
        else: results = query.filter(Project.deleted == False).all()
        session.close()
        return results


class Tag(Base):
    """ORM model representing a project tag"""
    __tablename__ = 'tags'

    id = Column(Integer, primary_key=True)
    label = Column(String(63))
    description = Column(String(255), default='')
    protected = Column(Boolean, default=False)
    pinned = Column(Boolean, default=False)


class ProjectTags(Base):
    """Join table for Projects and Tags"""
    __tablename__ = 'project_tags'

    projects_id = Column('projects_id', Integer, ForeignKey('projects.id'), primary_key=True)
    tags_id = Column('tags_id', Integer, ForeignKey('tags.id'), primary_key=True)


# Set configuration
db_url = 'sqlite:///projects.sqlite'    # TODO: Make these easily configurable
users_path = './data/users/'
repository_path = './data/repository/'

# Initialize the database singletons
db = create_engine(db_url, echo=True)
Session = sessionmaker(bind=db)
Base.metadata.create_all(db)
