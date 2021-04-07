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


class HubDatabase:
    db_url = 'sqlite:///jupyterhub.sqlite'
    echo = True

    def user_spawners(self, username):
        """Read the user spawners from the database"""
        # Establish a connection to the database
        engine = create_engine(self.db_url, echo=self.echo)
        session = engine.connect()

        # Query for the list of user spawners
        results = [r for r in session.execute(f"SELECT s.name, s.state, s.user_options, s.last_activity, s.started FROM spawners s, users u WHERE s.user_id = u.id AND u.name = '{username}'")]

        # Close the connection to the database and return
        session.close()
        return results


# Initialize the database singletons
hub_db = HubDatabase()
