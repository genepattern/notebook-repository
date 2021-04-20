import json
import os
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from .errors import SpecError, InviteError
from .hub import HubConfig
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

    def update_invites(self, spec):
        try:
            spec = json.loads(spec)                                             # Parse the update spec
            if 'invites' not in spec:                                           # Ensure invites is specified
                raise SpecError('No invites included in the spec')
            if type(spec['invites']) != list:                                   # Ensure invites is a list
                raise SpecError('Invites not specified in list format')

            old_invites = [i.user for i in self.invites]                        # Get users invited before the update
            new_invites = [i for i in spec['invites'] if i not in old_invites]  # Get the list of new invitees
            continuing_invites = [i for i in spec['invites'] if i in old_invites]  # Get the list of continuing invitees
            removed_invites = [i for i in old_invites if i not in continuing_invites]  # Get the users to be removed
            removed_invites = [i for i in self.invites if i.user in removed_invites]   # Get the instantiated objects

            # Set the new list of instantiated Invite objects
            invite_objects = [i for i in self.invites if i.user in continuing_invites]  # Add continuing invites
            for i in new_invites: invite_objects.append(Invite(self, i))        # Add new invites
            self.invites = invite_objects                                       # Set the list

            return new_invites, removed_invites                                 # Return the new and removed lists
        except json.JSONDecodeError:
            raise SpecError('Error parsing json')

    def validate_invites(self):
        # TODO: Validate emails or check valid usernames against the GenePattern server?
        for i in self.invites:
            if self.owner == i.user:
                raise InviteError('You cannot invite yourself to share.')

    def notify(self, new_users):
        # TODO: Implement
        # If new_users is None, notify all users
        # Otherwise, notify only those users in the list
        pass

    def exists(self):
        return Share.get(owner=self.owner, dir=self.dir) is not None

    def dir_exists(self):
        return os.path.exists(os.path.join(ProjectConfig.instance().users_path, self.owner, self.dir))

    def min_metadata(self):
        return self.dir and self.owner and len(self.invites)

    def invite_list(self):
        return [i.json() for i in self.invites]

    def json(self, full_metadata=True):
        data = { c.name: getattr(self, c.name) for c in self.__table__.columns }
        data['invites'] = self.invite_list()  # Special handling for invitees
        if full_metadata:
            spawner = HubConfig.instance().spawner_info(self.owner, self.dir)
            if spawner:
                metadata = json.loads(spawner[2])
                data['project'] = {
                    'slug': spawner[0],
                    'active': spawner[4] is not None,
                    'last_activity': spawner[3],
                    'display_name': metadata['name'] if 'name' in metadata else spawner[0],
                    'image': metadata['image'] if 'image' in metadata else '',
                    'description': metadata['description'] if 'description' in metadata else '',
                    'author': metadata['author'] if 'author' in metadata else '',
                    'quality': metadata['quality'] if 'quality' in metadata else '',
                    'tags': metadata['tags'] if 'tags' in metadata else '',
                    'status': json.loads(spawner[1])
            }
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

    @staticmethod
    def shared_with_me(user):
        session = ProjectConfig.instance().Session()
        query = session.query(Share).join(Share.invites, aliased=True).filter_by(user=user)
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
