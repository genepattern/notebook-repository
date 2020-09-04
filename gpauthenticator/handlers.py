import os
from jinja2 import ChoiceLoader, FileSystemLoader
from jupyterhub.handlers import BaseHandler, LoginHandler, LogoutHandler
from tornado.httpclient import AsyncHTTPClient, HTTPRequest, HTTPError

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), 'templates')


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


class LogoutHandler(LogoutHandler):
    """Log the user out and call GenePattern's logout endpoint"""

    async def handle_logout(self):
        """Call the genePattern logout endpoint and clear the GenePatternAccess cookie"""
        token = self.request.cookies['GenePatternAccess'].value

        # Attempt to call the logout endpoint
        http_client = AsyncHTTPClient()
        url = self.authenticator.genepattern_url + "/rest/v1/oauth2/logout"
        req = HTTPRequest(url, method="GET", headers={"Authorization": "Bearer " + token})
        try: http_client.fetch(req)
        except HTTPError: pass  # If there's an error, there's nothing we can do, move on

        # Clear the GenePattern cookie to force re-login
        self.clear_cookie('GenePatternAccess')
