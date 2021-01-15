import os
from jupyterhub.handlers import LoginHandler, LogoutHandler, url_escape
from tornado.httpclient import AsyncHTTPClient, HTTPRequest, HTTPError
from tornado.httputil import url_concat

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), 'templates')


class LoginHandler(LoginHandler):
    """Handle the login form and render the login page."""

    async def get(self, login_error=None):
        self.statsd.incr('login.request')
        user = self.current_user
        if user:
            # set new login cookie
            # because single-user cookie may have been cleared or incorrect
            self.set_login_cookie(user)
            self.redirect(self.get_next_url(user), permanent=False)
        else:
            username = self.get_argument('username', default='')
            template = self.render_template(
                'login.html',
                next=url_escape(self.get_argument('next', default='')),
                username=username,
                login_error=login_error,
                custom_html=self.authenticator.custom_html,
                login_url=self.settings['login_url'],
                authenticator_login_url=url_concat(
                    self.authenticator.login_url(self.hub.base_url),
                    {'next': self.get_argument('next', '')},
                ),
            )
            if not isinstance(template, str):
                template = await template
            self.write(template)


class LogoutHandler(LogoutHandler):
    """Log the user out and call GenePattern's logout endpoint"""

    async def handle_logout(self):
        """Call the genePattern logout endpoint and clear the GenePatternAccess cookie"""
        if 'GenePatternAccess' in self.request.cookies:
            token = self.request.cookies['GenePatternAccess'].value

            # Attempt to call the logout endpoint
            http_client = AsyncHTTPClient()
            url = self.authenticator.genepattern_url + "/rest/v1/oauth2/logout"
            req = HTTPRequest(url, method="GET", headers={"Authorization": "Bearer " + token})
            try: http_client.fetch(req)
            except HTTPError: pass  # If there's an error, there's nothing we can do, move on

            # Clear the GenePattern cookie to force re-login
            self.clear_cookie('GenePatternAccess')
