import os
from jupyterhub.handlers import BaseHandler
from tornado.web import authenticated


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


def shared_with_me(name):
    return '.' in name


def user(name):
    return name.split('.')[0]


def slug(name):
    return name.split('.')[1]
