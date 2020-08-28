import os
from jinja2 import ChoiceLoader, FileSystemLoader
from jupyterhub.handlers import BaseHandler, LoginHandler

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), 'templates')


# class GenePatternBaseHandler(BaseHandler):
#     def __init__(self, *args, **kwargs):
#         self._loaded = False
#         super().__init__(*args, **kwargs)
#
#     def _register_template_path(self):
#         if self._loaded:
#             return
#         self.log.debug('Adding %s to template path', TEMPLATE_DIR)
#         loader = FileSystemLoader([TEMPLATE_DIR])
#         env = self.settings['jinja2_env']
#         previous_loader = env.loader
#         env.loader = ChoiceLoader([previous_loader, loader])
#         self._loaded = True


class LoginHandler(LoginHandler):
    """Handle the login form and render the login page."""

    async def get(self):
        self.statsd.incr('login.request')
        user = self.current_user
        if user:
            # set new login cookie
            # because single-user cookie may have been cleared or incorrect
            self.set_login_cookie(user)
            self.redirect(self.get_next_url(user), permanent=False)
        else:
            username = self.get_argument('username', default='')
            self.finish(self._render(username=username))
