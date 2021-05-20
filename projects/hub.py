import json
import os
import requests
from jupyterhub.handlers import BaseHandler
from sqlalchemy import create_engine
from tornado.web import authenticated
from urllib.parse import quote, unquote
from .config import Config


def decode_username(encoded_name):
    """Transforms JupyterHub-encoded username to GenePattern username"""
    return unquote(encoded_name.replace('-', '%'))


def encode_username(username):
    return quote(username.lower(), safe='') \
        .replace('.', '%2e') \
        .replace('-', '%2d') \
        .replace('~', '%7e') \
        .replace('_', '%5f') \
        .replace('%', '-')


def create_named_server(hub_auth, user, server_name, spec):
    base_api_url = hub_auth.api_url
    token = hub_auth.api_token
    hub_user = encode_username(user)
    # Make the request to the JupyterHub API
    response = requests.post(f'{base_api_url}/users/{hub_user}/servers/{server_name}',
          headers={ 'Authorization': 'token %s' % token },
          data=json.dumps({
              'image': spec['image'],
              'name': spec['name'],
              'description': spec['description']
          }))
    response.raise_for_status()
    return f'/user/{hub_user}/{server_name}'


def user_spawners(username):
    """Read the user spawners from the database"""
    config = Config.instance()

    # Establish a connection to the database
    engine = create_engine(f'sqlite:///{config.HUB_DB}', echo=config.DB_ECHO)
    session = engine.connect()

    # Query for the list of user spawners
    results = [r for r in session.execute(f"SELECT s.name, s.state, s.user_options, s.last_activity, s.started FROM spawners s, users u WHERE s.user_id = u.id AND u.name = '{username}'")]

    # Close the connection to the database and return
    session.close()
    return results


def spawner_info(username, dir):
    """Read the user spawners from the database"""
    config = Config.instance()

    # Establish a connection to the database
    engine = create_engine(f'sqlite:///{config.HUB_DB}', echo=config.DB_ECHO)
    session = engine.connect()

    # Query for the list of user spawners
    result = session.execute(f"SELECT s.name, s.state, s.user_options, s.last_activity, s.started FROM spawners s, users u WHERE s.name = '{dir}' AND s.user_id = u.id AND u.name = '{username}'").first()

    # Close the connection to the database and return
    session.close()
    return result


class UserHandler(BaseHandler):
    """Serve the user info from its template: theme/templates/user.json"""

    @authenticated
    async def get(self):
        template = await self.render_template('user.json')
        self.write(template)


class PreviewHandler(BaseHandler):
    """Serve the preview from its template: theme/templates/preview.html"""

    async def get(self):
        template = await self.render_template('preview.html')
        self.write(template)


# OLDER VERSIONS OF JUPYTERHUB MAY REQUIRE NON-ASYNC:
#
# class UserHandler(BaseHandler):
#     """Serve the user info from its template: theme/templates/user.json"""
#
#     @authenticated
#     def get(self):
#         self.write(self.render_template('user.json'))


def pre_spawn_hook(spawner, userdir=''):
    project_dir = os.path.join(userdir, spawner.user.name, spawner.name)
    if shared_with_me(spawner.name):    # If this is a project shared with me, lazily create the symlink
        if not os.path.exists(project_dir):
            os.symlink(f'../{user(spawner.name)}/{slug(spawner.name)}', project_dir)
    else:                               # Otherwise, lazily create the project directory
        os.makedirs(project_dir, 0o777, exist_ok=True)
    os.chmod(project_dir, 0o777)


def shared_with_me(name):
    return '.' in name


def user(name):
    return name.split('.')[0]


def slug(name):
    return name.split('.')[1]
