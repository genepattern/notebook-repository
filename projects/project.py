import json
import os
import shutil
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime, Boolean, ForeignKey, desc
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, backref
from .config import Config
from .errors import SpecError
from .hub import encode_username, spawner_info


Base = declarative_base()


class Project(Base):
    """ORM model representing a personal project"""
    __tablename__ = 'myprojects'

    id = Column(Integer, primary_key=True)
    owner = Column(String(255))
    dir = Column(String(255))
    image = Column(String(255))

    name = Column(String(255))
    description = Column(String(255), default='')
    author = Column(String(255), default='')
    quality = Column(String(255), default='')
    citation = Column(String(511), default='')
    tags = Column(String(255), default='')

    def __init__(self, spec=None):
        super(Project, self).__init__()                                     # Call the superclass constructor
        if spec is None: return                                             # If no spec, nothing left to do

        # If a spec was given, parse it and instantiate this project with the data
        try:
            if isinstance(spec, str): spec = json.loads(spec)               # Parse the JSON, if necessary
            for key in Project.__dict__:                                    # Assign attributes from the json
                if key in spec:
                    if isinstance(spec[key], str): setattr(self, key, spec[key].strip())
                    else: setattr(self, key, spec[key])
        except json.JSONDecodeError:
            raise SpecError('Error parsing json')

    def json(self):
        data = { c.name: getattr(self, c.name) for c in self.__table__.columns }
        for k in data:
            if isinstance(data[k], datetime):                               # Special handling for datetimes
                data[k] = str(data[k])
        return data

    def duplicate(self, new_dir):
        src_dir = os.path.join(Config.instance().USERS_PATH, self.owner, self.dir)
        dst_dir = os.path.join(Config.instance().USERS_PATH, self.owner, new_dir)
        shutil.copytree(src_dir, dst_dir)

    @staticmethod
    def get(id=None, owner=None, dir=None):
        spawner = spawner_info(owner, dir)
        if spawner:
            metadata = json.loads(spawner[2])
            data = {
                'dir': dir,
                'owner': owner,
                'image': metadata['image'] if 'image' in metadata else '',
                'name': metadata['name'] if 'name' in metadata else spawner[0],
                'description': metadata['description'] if 'description' in metadata else '',
                'author': metadata['author'] if 'author' in metadata else '',
                'quality': metadata['quality'] if 'quality' in metadata else '',
                'tags': metadata['tags'] if 'tags' in metadata else '',
                'citation': metadata['citation'] if 'citation' in metadata else ''
            }
            return Project(json.dumps(data))
        else: return None
        # TODO: Likely implementation after refactor
        # session = ProjectConfig.instance().Session()
        # query = session.query(Project)
        # if id is not None:      query = query.filter(Project.id == id)
        # if owner is not None:   query = query.filter(Project.owner == owner)
        # if dir is not None:     query = query.filter(Project.dir == dir)
        # project = query.first()
        # session.close()
        # return project


# Set database configuration
class ProjectConfig:
    _project_singleton = None
    db = None
    Session = None

    def __init__(self):
        config = Config.instance()
        self.db = create_engine(f'sqlite:///{config.DB_PATH}', echo=config.DB_ECHO)
        self.Session = sessionmaker(bind=self.db)
        Base.metadata.create_all(self.db)

    @classmethod
    def instance(cls):
        if cls._project_singleton is None:
            cls._project_singleton = ProjectConfig()
        return cls._project_singleton


def unused_dir(user, dir_name):
    count = 1
    checked_name = dir_name
    while True:
        hub_user = encode_username(user)                            # Encoded JupyterHub username
        project_dir = os.path.join(Config.instance().USERS_PATH, hub_user, checked_name)  # Path to check
        if os.path.exists(project_dir):                             # If it exists, append a number and try again
            checked_name = f'{dir_name}{count}'
            count += 1
        else:
            return checked_name, count-1
