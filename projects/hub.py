import json
import requests
from sqlalchemy import create_engine


def create_named_server(hub_auth, user, server_name, spec):
    base_api_url = hub_auth.api_url
    token = hub_auth.api_token
    # Make the request to the JupyterHub API
    response = requests.post(f'{base_api_url}/users/{user}/servers/{server_name}',
          headers={ 'Authorization': 'token %s' % token },
          data=json.dumps({
              'image': spec['image'],
              'name': spec['name'],
              'description': spec['description']
          }))
    response.raise_for_status()
    return f'/user/{user}/{server_name}'


# Set configuration
class HubConfig:
    _hub_singleton = None
    db = None
    db_url = 'sqlite:////data/jupyterhub.sqlite'
    echo = None

    def __init__(self, db_url, echo):
        self.db_url = db_url
        self.echo = echo

    @classmethod
    def set_config(cls, db_url, echo):
        cls._hub_singleton = HubConfig(db_url, echo)

    @classmethod
    def instance(cls):
        if cls._hub_singleton is None:
            raise RuntimeError('The hub singleton has not yet been defined')
        else:
            return cls._hub_singleton

    @classmethod
    def user_spawners(cls, username):
        """Read the user spawners from the database"""
        # Establish a connection to the database
        engine = create_engine(cls.instance().db_url, echo=cls.instance().echo)
        session = engine.connect()

        # Query for the list of user spawners
        results = [r for r in session.execute(f"SELECT s.name, s.state, s.user_options, s.last_activity, s.started FROM spawners s, users u WHERE s.user_id = u.id AND u.name = '{username}'")]

        # Close the connection to the database and return
        session.close()
        return results

    @classmethod
    def spawner_info(cls, username, dir):
        """Read the user spawners from the database"""
        # Establish a connection to the database
        engine = create_engine(cls.instance().db_url, echo=cls.instance().echo)
        session = engine.connect()

        # Query for the list of user spawners
        result = session.execute(f"SELECT s.name, s.state, s.user_options, s.last_activity, s.started FROM spawners s, users u WHERE s.name = '{dir}' AND s.user_id = u.id AND u.name = '{username}'").first()

        # Close the connection to the database and return
        session.close()
        return result
