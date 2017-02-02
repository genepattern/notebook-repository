"""
Custom Authenticator to use GenePattern OAuth2 with JupyterHub
@author Thorin Tabor
Adapted from OAuthenticator code
"""
import datetime
import json
import os
import shutil
from tornado import gen, web
from tornado.httputil import url_concat
from tornado.httpclient import HTTPRequest, AsyncHTTPClient, HTTPError
from jupyterhub.auth import Authenticator, LocalAuthenticator


class GenePatternAuthenticator(Authenticator):
    # URL of the GenePattern server you are authenticating with
    GENEPATTERN_URL = "https://genepattern.broadinstitute.org/gp"

    # Path to write authentication files to, for use with repo service authentication
    # Set to None to turn off writing authentication files
    REPO_AUTH_PATH = "/path/to/auth"

    # Path to the directory containing user notebook files
    # Set to None to turn off lazily creating user directories on authentication
    USERS_DIR_PATH = "/path/to/users"

    # Path to the directory containing the default notebooks to give new users
    # Set to None to skip copying any example notebooks
    DEFAULT_NB_DIR = "/path/to/defaults"

    @gen.coroutine
    def authenticate(self, handler, data):
        """Authenticate with GenePattern, and return the username if login is successful.

        Return None otherwise.
        """
        http_client = AsyncHTTPClient()
        username = data['username']
        password = data['password']

        # if not self.check_whitelist(username):
        #     return

        # Set the necessary params
        params = dict(
            grant_type="password",
            username=username,
            password=password,
            client_id="GenePatternNotebook"
        )

        url = url_concat(self.GENEPATTERN_URL + "/rest/v1/oauth2/token", params)

        req = HTTPRequest(url,
                          method="POST",
                          headers={"Accept": "application/json"},
                          body=''  # Body is required for a POST...
                          )

        try:
            resp = yield http_client.fetch(req)
        except HTTPError as e:
            # This is likely a 400 Bad Request error due to an invalid username or password
            return

        if resp is not None and resp.code == 200:
            # If REPO_AUTH_PATH is set, write the authentication file
            if self.REPO_AUTH_PATH is not None:
                response_payload = json.loads(resp.body.decode("utf-8"))
                auth_dict = {
                    "username": username,
                    "token": response_payload['access_token'],
                    "timestamp": datetime.datetime.now().timestamp(),
                }
                auth_file = os.path.join(self.REPO_AUTH_PATH, username.lower() + '.json')
                f = open(auth_file, 'w')
                f.write(json.dumps(auth_dict))
                f.close()

            # If USERS_DIR_PATH is set, lazily create user directory
            if self.USERS_DIR_PATH is not None:
                specific_user = os.path.join(self.USERS_DIR_PATH, username.lower())
                if not os.path.exists(specific_user):
                    os.makedirs(specific_user)
                    os.chmod(specific_user, 0o777)

                    # Copy over example notebooks if USERS_DIR_PATH is set
                    if self.DEFAULT_NB_DIR is not None:
                        all_files = os.listdir(self.DEFAULT_NB_DIR)
                        for f in all_files:
                            file_path = os.path.join(self.DEFAULT_NB_DIR, f)
                            if os.path.isdir(file_path):
                                shutil.copytree(file_path, os.path.join(specific_user, f))
                            elif os.path.isfile(file_path):
                                shutil.copy(file_path, specific_user)

            # Return the username
            return username
        else:
            return


class LocalGenePatternAuthenticator(LocalAuthenticator, GenePatternAuthenticator):
    """A version that mixes in local system user creation"""
    pass
