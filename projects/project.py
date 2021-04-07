import json
import os
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, backref, sessionmaker
from .zip import zip_dir, unzip_dir, list_files

Base = declarative_base()


class Project(Base):
    """ORM model representing a published project"""
    __tablename__ = 'projects'

    id = Column(Integer, primary_key=True)
    dir = Column(String(255))
    image = Column(String(255))

    name = Column(String(255))
    description = Column(String(255), default='')
    author = Column(String(255), default='')
    quality = Column(String(255), default='')

    tags = relationship('Tag', secondary='project_tags', lazy='subquery', backref=backref('projects', lazy=True))
    updates = relationship('Update', lazy='subquery')

    created = Column(DateTime, default=datetime.utcnow)
    updated = Column(DateTime, default=datetime.utcnow)

    copied = Column(Integer, default=1)

    owner = Column(String(255))
    deleted = Column(Boolean, default=False)

    def __init__(self, spec=None):
        super(Project, self).__init__()                                     # Call the superclass constructor
        if spec is None: return                                             # If no spec, nothing left to do

        # If a spec was given, parse it and instantiate this project with the data
        try:
            if isinstance(spec, str): spec = json.loads(spec)               # Parse the JSON, if necessary
            for key in Project.__dict__:                                    # Assign attributes from the json
                if key in spec:
                    if key == 'tags': self.lazily_create_tags(spec[key])    # Special handling of tags
                    elif isinstance(spec[key], str): setattr(self, key, spec[key].strip())
                    else: setattr(self, key, spec[key])
        except json.JSONDecodeError:
            raise Project.SpecError('Error parsing json')

    def lazily_create_tags(self, tags_str):
        if len(tags_str.strip()) == 0: labels = []                          # If there are no tags, empty labels list
        else: labels = tags_str.strip().split(',')                          # Otherwise, get the list of tag labels

        tags = []
        for label in labels:                                                # For each label
            tag = self.get_tag(label)                                       # Get the tag if already loaded from the DB
            if tag: tags.append(tag)                                        # And append to the new list
            else:
                tag = Tag.get(label=label)                                  # Otherwise, load the tag from the DB
                if tag: tags.append(tag)                                    # And append
                else: tags.append(Tag(label=label).save())                  # In necessary, create the tag in the DB
        self.tags = tags                                                    # Add the new tags to the project

    def get_tag(self, label):
        for tag in self.tags:
            if tag.label == label:
                return tag
        return None

    def exists(self):
        return Project.get(owner=self.owner, dir=self.dir) is not None

    def zip(self):
        if not self.min_metadata(): raise Project.SpecError('Missing required attributes')
        project_dir = os.path.join(ProjectConfig.users_path, self.owner, self.dir)  # Path to the source project
        zip_path = self.zip_path()                                              # Path to the zipped project
        os.makedirs(os.path.dirname(zip_path), mode=0o777, exist_ok=True)       # Lazily create directories
        if os.path.exists(zip_path): os.remove(zip_path)                        # Remove the old copy if one exists
        zip_dir(project_dir, zip_path)                                          # Create the zip file

    def delete_zip(self):
        zip_path = self.zip_path()                                              # Path to the zipped project
        if os.path.exists(zip_path): os.remove(zip_path)                        # Remove the zip file

    def unzip(self, target_user, dir):
        zip_path = self.zip_path()                                              # Path to the zipped project
        target_dir = os.path.join(ProjectConfig.users_path, target_user, dir)   # Path in which to unzip
        os.makedirs(os.path.dirname(target_dir), mode=0o777, exist_ok=True)     # Lazily create directories
        unzip_dir(zip_path, target_dir)                                         # Unzip to directory

    def delete(self):
        self.deleted = True
        self.updated = datetime.now()
        return self.save()

    def save(self):
        # Ensure that the project has all of the required information
        if not self.min_metadata(): raise Project.SpecError('Missing required attributes')
        # Add initial update to updates table, if necessary
        if not len(self.updates): Update(self, f'Initial release of {self.name}')
        # Save the project to the database and return the json representation
        project_json = Project.put(self)
        return project_json

    def update(self, merge):
        if 'name' in merge: self.name = merge['name'].strip()               # Merge updated metadata
        if 'description' in merge: self.description = merge['description'].strip()
        if 'author' in merge: self.author = merge['author'].strip()
        if 'quality' in merge: self.quality = merge['quality'].strip()
        if 'image' in merge: self.image = merge['image'].strip()
        if 'tags' in merge: self.lazily_create_tags(merge['tags'].strip())
        if 'comment' in merge: Update(self, merge['comment'].strip())       # Create the Update object
        self.updated = datetime.now()                                       # Set last updated
        self.deleted = False                                                # Updated projects are never deleted
        # Ensure that the new metadata meets the minimum requirements
        if not self.min_metadata() or 'comment' not in merge or not merge['comment'].strip():
            missing = []
            if not self.name: missing.append('name')
            if not self.author: missing.append('author')
            if not self.quality: missing.append('quality')
            if 'comment' not in merge or not merge['comment']: missing.append('comment')
            raise Project.SpecError(','.join(missing))

    def min_metadata(self):
        return self.dir and self.image and self.name and self.author and self.quality and self.owner

    def tags_str(self):
        labels = [tag.label for tag in self.tags]
        return ','.join(labels)

    def json(self, include_files=False):
        data = { c.name: getattr(self, c.name) for c in self.__table__.columns }
        for k in data:
            if isinstance(data[k], datetime):                               # Special handling for datetimes
                data[k] = str(data[k])
        data['tags'] = self.tags_str()                                      # Special handling for tags
        if include_files: data['files'] = list_files(self.zip_path())
        return data

    def zip_path(self):
        return os.path.join(ProjectConfig.repository_path, self.owner, f'{self.dir}.zip')

    def mark_copied(self):
        self.copied += 1
        Project.put(self)

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
    def unused_dir(user, dir_name):
        count = 1
        checked_name = dir_name
        while True:
            project_dir = os.path.join(ProjectConfig.users_path, user, checked_name)  # Path to directory to check
            if os.path.exists(project_dir):                             # If it exists, append a number and try again
                checked_name = f'{dir_name}{count}'
                count += 1
            else:
                return checked_name

    @staticmethod
    def get(id=None, owner=None, dir=None):
        session = Session()
        query = session.query(Project)
        if id is not None:      query = query.filter(Project.id == id)
        if owner is not None:   query = query.filter(Project.owner == owner)
        if dir is not None:     query = query.filter(Project.dir == dir)
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
    def all(include_deleted=False):
        session = Session()
        query = session.query(Project)
        if not include_deleted: query = query.filter(Project.deleted == False)
        results = query.all()
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

    def __init__(self, label=None):
        if label: self.label = label

    @staticmethod
    def get(id=None, label=None):
        session = Session()
        query = session.query(Tag)
        if id is not None:      query = query.filter(Tag.id == id)
        if label is not None:   query = query.filter(Tag.label == label)
        tag = query.first()
        session.close()
        return tag

    @staticmethod
    def put(tag):
        session = Session()
        session.add(tag)
        session.commit()
        d = tag.json()
        session.close()
        return d  # Return the json representation

    @staticmethod
    def all_pinned():
        session = Session()
        query = session.query(Tag).filter(Tag.pinned == True)
        results = query.all()
        session.close()
        return results

    @staticmethod
    def all_protected():
        session = Session()
        query = session.query(Tag).filter(Tag.protected == True)
        results = query.all()
        session.close()
        return results

    def json(self):
        data = { c.name: getattr(self, c.name) for c in self.__table__.columns }
        return data

    def min_metadata(self):
        return True if self.label else False

    def save(self):
        # Ensure that the project has all of the required information
        if not self.min_metadata(): raise Tag.SpecError('Missing required attributes')
        # Save the project to the database and return the json representation
        Tag.put(self)
        return self

    class SpecError(RuntimeError):
        """Error to return if attempting to initialize a project from a bad specification"""
        pass


class ProjectTags(Base):
    """Join table for Projects and Tags"""
    __tablename__ = 'project_tags'

    projects_id = Column('projects_id', Integer, ForeignKey('projects.id'), primary_key=True)
    tags_id = Column('tags_id', Integer, ForeignKey('tags.id'), primary_key=True)


class Update(Base):
    """Orm model for project updates"""
    __tablename__ = 'updates'

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey('projects.id'))
    project = relationship('Project', back_populates='updates')
    updated = Column(DateTime, default=datetime.utcnow)
    comment = Column(String(255), default='')

    def __init__(self, project, comment=''):
        self.project = project
        self.project_id = project.id
        self.comment = comment


# Set configuration
class ProjectConfig:
    db_url = 'sqlite:///projects.sqlite'
    users_path = '/data/users/'
    repository_path = '/data/repository/'


# Initialize the database singletons
db = create_engine(ProjectConfig.db_url, echo=False)
Session = sessionmaker(bind=db)
Base.metadata.create_all(db)
