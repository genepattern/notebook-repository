import json
import os
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from .errors import SpecError
from .project import ProjectConfig, Base


class Share(Base):
    """ORM model representing a shared project"""
    __tablename__ = 'shares'

    id = Column(Integer, primary_key=True)
    owner = Column(String(255))
    dir = Column(String(255))
    invites = relationship('Invite', lazy='subquery')

    def __init__(self, spec=None):
        super(Share, self).__init__()                                       # Call the superclass constructor
        if spec is None: return                                             # If no spec, nothing left to do

        # If a spec was given, parse it and instantiate this share with the data
        try:
            if isinstance(spec, str): spec = json.loads(spec)               # Parse the JSON, if necessary
            for key in Share.__dict__:                                      # Assign attributes from the json
                if key in spec:
                    if key == 'invites': self.create_invites(spec[key])     # Special handling for invitees
                    elif isinstance(spec[key], str): setattr(self, key, spec[key].strip())
                    else: setattr(self, key, spec[key])

            # Ensure that the share has all of the required information
            if not self.min_metadata(): raise SpecError('Missing required attributes')
        except json.JSONDecodeError:
            raise SpecError('Error parsing json')

    def create_invites(self, invites):
        self.invites = [Invite(self, i) for i in invites]

    def validate_invitees(self):
        # TODO: Implement
        # TODO: Make sure the invite list doesn't include yourself (or ignore)
        pass

    def notify(self):
        # TODO: Implement
        pass

    def exists(self):
        return Share.get(owner=self.owner, dir=self.dir) is not None

    def dir_exists(self):
        return os.path.exists(os.path.join(ProjectConfig.instance().users_path, self.owner, self.dir))

    def min_metadata(self):
        return self.dir and self.owner and len(self.invites)

    def invite_list(self):
        return [i.json() for i in self.invites]

    def json(self, full_metadata=False):
        data = { c.name: getattr(self, c.name) for c in self.__table__.columns }
        data['invites'] = self.invite_list()  # Special handling for invitees
        if full_metadata:
            # TODO: Populate full project metadata from the hub
            pass
        return data

    def save(self):
        """Save the share to the database and return the json representation"""
        share_json = Share.put(self)
        return share_json

    def delete(self):
        for invite in self.invites:
            Invite.remove(invite)
        Share.remove(self)

    @staticmethod
    def get(id=None, owner=None, dir=None):
        session = ProjectConfig.instance().Session()
        query = session.query(Share)
        if id is not None:      query = query.filter(Share.id == id)
        if owner is not None:   query = query.filter(Share.owner == owner)
        if dir is not None:     query = query.filter(Share.dir == dir)
        share = query.first()
        session.close()
        return share

    @staticmethod
    def put(share):
        session = ProjectConfig.instance().Session()
        session.add(share)
        session.commit()
        d = share.json()
        session.close()
        return d  # Return the json representation

    @staticmethod
    def remove(share):
        session = ProjectConfig.instance().Session()
        session.delete(share)
        session.commit()
        session.close()

    @staticmethod
    def shared_by_me(owner):
        session = ProjectConfig.instance().Session()
        query = session.query(Share).filter(Share.owner == owner)
        results = query.all()
        session.close()
        return results


class Invite(Base):
    """ORM model for sharing invites (non-owner collaborators)"""
    __tablename__ = 'invites'

    id = Column(Integer, primary_key=True)
    share_id = Column(Integer, ForeignKey('shares.id'))
    share = relationship('Share', back_populates='invites')
    user = Column(String(255))
    accepted = Column(Boolean, default=False)

    def __init__(self, share, user):
        self.share = share
        self.share_id = share.id
        self.user = user

    def json(self):
        return { 'id': self.id, 'user': self.user, 'accepted': self.accepted }

    def save(self):
        """Save the share to the database and return the json representation"""
        invite_json = Invite.put(self)
        return invite_json

    def delete(self):
        Invite.remove(self)

    @staticmethod
    def get(id=None):
        session = ProjectConfig.instance().Session()
        query = session.query(Invite)
        if id is not None:      query = query.filter(Invite.id == id)
        invite = query.first()
        session.close()
        return invite

    @staticmethod
    def put(invite):
        session = ProjectConfig.instance().Session()
        session.add(invite)
        session.commit()
        d = invite.json()
        session.close()
        return d  # Return the json representation

    @staticmethod
    def remove(invite):
        session = ProjectConfig.instance().Session()
        session.delete(invite)
        session.commit()
        session.close()
