import json
import os
import shutil
import subprocess
import urllib.parse

from tornado import gen
from tornado.httputil import url_concat
from tornado.httpclient import HTTPRequest, AsyncHTTPClient, HTTPError
from jupyterhub.auth import Authenticator
from traitlets import Unicode, Bool

from gpauthenticator.handlers import LoginHandler, LogoutHandler


class GenePatternAuthenticator(Authenticator):
    """Authenticate login with a GenePattern server"""

    # Specify configuration variables
    genepattern_url = Unicode(
        "https://cloud.genepattern.org/gp",
        config=True,
        help="URL of the GenePattern server you are authenticating with"
    )

    users_dir_path = Unicode(
        config=True,
        default=None,
        allow_none=True,
        help="Path to the directory containing user notebook files"
    )

    default_nb_dir = Unicode(
        config=True,
        default=None,
        allow_none=True,
        help="Path to the directory containing the default notebooks to give new users"
    )

    autoscale_script = Unicode(
        config=True,
        default=None,
        allow_none=True,
        help="Path to script managing compute cluster"
    )

    load_config_from_repo = Bool(
        config=True,
        default=False,
        help="Load default config from the repository settings file"
    )

    load_config_from_env = Bool(
        config=True,
        default=False,
        help="Load default config from environment variables"
    )

    auto_login = Bool(
        True,
        config=True,
        help="""Automatically begin the login process""",
    )

    def __init__(self, **kwargs):
        self.load_config()
        super().__init__(**kwargs)

    @gen.coroutine
    def authenticate(self, handler, data):
        """Authenticate with GenePattern, and return the username if login is successful; return None otherwise."""

        # Handle form submission, if included with the request
        if data: return self.login_from_form(handler, data)

        # Otherwise, attempt to log in via session cookie
        return self.login_from_cookie(handler)

    def get_handlers(self, app):
        genepattern_handlers = [
            (r'/login/form', LoginHandler),
            (r'/logout', LogoutHandler),
            # (r'/signup', SignUpHandler),
            # (r'/authorize', AuthorizationHandler),
            # (r'/authorize/([^/]*)', ChangeAuthorizationHandler),
            # (r'/change-password', ChangePasswordHandler),
        ]
        return genepattern_handlers

    @gen.coroutine
    def refresh_user(self, user, handler=None):
        if 'GenePatternAccess' in handler.request.cookies:
            token = handler.request.cookies['GenePatternAccess'].value

            # Attempt to call the username endpoint
            http_client = AsyncHTTPClient()
            url = self.genepattern_url + "/rest/v1/config/user"
            req = HTTPRequest(url, method="GET", headers={"Authorization": "Bearer " + token})
            try:
                resp = yield http_client.fetch(req)
                resp_json = json.loads(resp.body.decode("utf-8"))
                username = resp_json['result']

                # Set the cookie and return
                handler.set_cookie('GenePatternAccess', token)
                return {"name": username, "auth_state": {"access_token": token}}
            except HTTPError: return False
        else:
            return False

    def pre_spawn_start(self, user, spawner):
        """Create the user directory and tend to the autoscale group before the user server is spawned"""

        # If USERS_DIR_PATH is set, lazily create user directory
        self.create_user_directory(user.name)

        # Attempt to call the scale up script
        self.call_autoscale_script()

    def normalize_username(self, username):
        """Normalize the given username to lowercase and to remove special characters

           Overrides Authenticator.normalize_username()"""
        return urllib.parse.quote(username.lower(), safe='') \
            .replace('.', '%2e') \
            .replace('-', '%2d') \
            .replace('~', '%7e') \
            .replace('_', '%5f') \
            .replace('%', '-')

    def login_from_cookie(self, handler, redirect=True):
        """Handle login via the GenePattern session cookie"""
        token = None

        if 'GenePatternAccess' in handler.request.cookies:
            token = handler.request.cookies['GenePatternAccess'].value

            # Attempt to call the username endpoint
            http_client = AsyncHTTPClient()
            url = self.genepattern_url + "/rest/v1/config/user"
            req = HTTPRequest(url, method="GET", headers={"Authorization": "Bearer " + token})
            try:
                resp = yield http_client.fetch(req)
                resp_json = json.loads(resp.body.decode("utf-8"))
                username = resp_json['result']

                # Return the username
                return {"name": username, "auth_state": {"access_token": token}}

            # An error means we can't verify authentication, redirect to login page
            except HTTPError as e: pass

        # Fall back to logging in via login form if cookie is invalid or not available
        if redirect: handler.redirect('/hub/login/form?' + handler.request.query)
        else: return False

    def login_from_form(self, handler, data):
        """Handle login form submission then return user and auth state"""

        # Initialize the HTTP client
        http_client = AsyncHTTPClient()
        username = data['username']
        password = data['password']

        # Set the necessary params
        params = dict(
            grant_type="password",
            username=username,
            password=password,
            client_id="GenePatternNotebook")
        url = url_concat(self.genepattern_url + "/rest/v1/oauth2/token", params)

        # Make the login request -- Body is required for a POST...
        req = HTTPRequest(url, method="POST", headers={"Accept": "application/json"}, body='')
        try:
            resp = yield http_client.fetch(req)
        # This is likely a 400 Bad Request error due to an invalid username or password
        except HTTPError as e:
            return

        # Handle the response
        if resp is not None and resp.code == 200:
            response_payload = json.loads(resp.body.decode("utf-8"))

            # Set the GenePattern access cookie
            handler.set_cookie('GenePatternAccess', response_payload['access_token'])

            # Return the username
            return {"name": username, "auth_state": {"access_token": response_payload['access_token']}}
        else:
            return

    def load_config(self):
        """Load configuration from other sources, if enabled"""

        # Import config from nbrepo app, if possible and enabled
        if self.load_config_from_repo:
            try:
                import nbrepo.settings as settings  # nbrepo needs to be on your Python path
                self.genepattern_url = settings.BASE_GENEPATTERN_URL
                self.users_dir_path = settings.BASE_USER_PATH
                self.default_nb_dir = settings.DEFAULT_NB_DIR
                self.autoscale_script = settings.AUTOSCALE_SCRIPT
            except ImportError: pass

        # Otherwise, import from an environment variable if enabled
        if self.load_config_from_env:
            if 'GENEPATTERN_URL' in os.environ:
                self.genepattern_url = os.environ['GENEPATTERN_URL']
            if 'DATA_DIR' in os.environ:
                self.users_dir_path = os.environ['DATA_DIR'] + "/users"
                self.default_nb_dir = os.environ['DATA_DIR'] + "/defaults"
            if 'AUTOSCALE_SCRIPT' in os.environ:
                self.autoscale_script = os.environ['AUTOSCALE_SCRIPT']

    def call_autoscale_script(self):
        """Attempt to call the scale up script"""
        if self.autoscale_script:
            try:
                print('Calling autoscale script.')
                subprocess.call(self.autoscale_script.split())
            except:
                print('Could not call autoscale script.')

    def create_user_directory(self, username):
        """Lazily create the user directory"""
        if self.users_dir_path is not None:
            specific_user = os.path.join(self.users_dir_path, username)
            if not os.path.exists(specific_user):
                os.makedirs(specific_user)

                # Copy over example notebooks if USERS_DIR_PATH is set
                if self.default_nb_dir is not None and os.path.exists(self.default_nb_dir):
                    all_files = os.listdir(self.default_nb_dir)
                    for f in all_files:
                        file_path = os.path.join(self.default_nb_dir, f)
                        if os.path.isdir(file_path):
                            shutil.copytree(file_path, os.path.join(specific_user, f))
                        elif os.path.isfile(file_path):
                            shutil.copy(file_path, specific_user)

            # Make sure the directory has the correct permissions
            os.chmod(specific_user, 0o777)
