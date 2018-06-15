import datetime
import json
import os

from django.contrib.auth.models import User
import requests
from rest_framework.authentication import TokenAuthentication, get_authorization_header
from rest_framework import exceptions
from rest_framework.authtoken.models import Token

from jupyterhub.services.auth import HubAuth

from nbrepo import settings


class JupyterHubAuthentication(TokenAuthentication):
    # Get API token or create a dummy
    try:
        api_token = os.environ['JUPYTERHUB_API_TOKEN']
    except KeyError:
        api_token = 'dummy_token'

    # Create the authentication handler
    auth = HubAuth(api_token=api_token, cache_max_age=60)

    def authenticate(self, request):
        # If in development mode, assume authentication is good
        if settings.JUPYTERHUB is False:
            if 'username' in request.POST:
                username = request.POST['username']
            else:
                username = None

            # Return failure if username cannot be found
            if username is None:
                return None

        # Otherwise get the username from JupyterHub
        else:
            cookie = request.COOKIES.get(self.auth.cookie_name)
            token = request.META.get(self.auth.auth_header_name)
            if cookie:
                user = self.auth.user_for_cookie(cookie)
            elif token:
                user = self.auth.user_for_token(token)
            else:
                return None

            # Get the user object, lazily create one if it doesn't exist
            username = user.get('name')

        # Get the user model or lazily create one
        try:
            user_model = User.objects.get(username=username)
        except User.DoesNotExist:
            user_model = User(username=username)
            user_model.save()

        # Get the authentication token
        token_model = Token.objects.get(user=user_model)

        # Return the user object and token.key
        return (user_model, token_model.key)


class GenePatternAuthentication(TokenAuthentication):
    supports_inactive_user = False

    def authenticate(self, request):
        # If the token is attached to the request, verify the inbuilt way
        auth_header = get_authorization_header(request).split()
        if auth_header and auth_header[0].lower() == self.keyword.lower().encode():
            return super(GenePatternAuthentication, self).authenticate(request)

        # Otherwise, assume username & password authentication through GenePattern

        # Get the username from the post
        if 'username' in request.POST:
            username = request.POST['username']
        else:
            username = None

        # Return failure if username cannot be found
        if username is None:
            return None
            #raise exceptions.AuthenticationFailed("username not passed as POST parameter")

        # If in development mode, assume authentication is good
        if settings.DEBUG is True:
            try:
                user_model = User.objects.get(username=username)
            except User.DoesNotExist:
                user_model = User(username=username)
                user_model.save()

            try:
                token_model = Token.objects.get(user=user_model)
            except Token.DoesNotExist:
                token_model = Token(user=user_model, key=username)
                token_model.save()

            return (user_model, token_model.key)

        # Get the authentication file written by the JupyterHub authenticator, fail if file not found
        auth_file = settings.BASE_AUTH_PATH + '/' + username.lower() + '.json'

        if not os.path.isfile(auth_file):
            raise exceptions.AuthenticationFailed("authentication file not found")

        # Read the authentication file
        try:
            auth_raw = open(auth_file, 'r').read()
        except OSError:
            raise exceptions.AuthenticationFailed("error reading authentication file")

        try:
            auth_data = json.loads(auth_raw)
        except ValueError:
            raise exceptions.AuthenticationFailed("authentication file not in correct format")

        # Compare timestamp and return a failure if too old or bad
        now = datetime.datetime.now()
        try:
            auth_time = datetime.datetime.fromtimestamp(auth_data['timestamp'])
        except ValueError:
            raise exceptions.AuthenticationFailed("unable to read timestamp in authentication file")

        if now > auth_time + datetime.timedelta(weeks=1):
            raise exceptions.AuthenticationFailed("authentication file expired")

        # Return a failure if username in file doesn't match username in request
        if auth_data['username'].lower() != username:
            raise exceptions.AuthenticationFailed("authentication username mismatch")

        # Make a call to the GenePattern API
        token = auth_data['token']
        auth_endpoint = settings.BASE_GENEPATTERN_URL + '/rest/v1/config/user'

        try:
            response = requests.get(auth_endpoint, headers={"Authorization": "Bearer " + token})
        except ConnectionError:
            raise exceptions.AuthenticationFailed("unable to connect to GenePattern server")

        # Return a failure if the call results in an error
        if response.status_code != 200:
            raise exceptions.AuthenticationFailed("error response from GenePattern: " + response.status_code)

        # Return a failure if the username GenePattern returns doesn't match the requested one
        try:
            response_object = response.json()
        except ValueError:
            raise exceptions.AuthenticationFailed("error parsing response")

        if response_object['result'].lower() != username:
            raise exceptions.AuthenticationFailed("username does not match GenePattern response")

        # Get the user object, lazily create one if it doesn't exist
        try:
            user_model = User.objects.get(username=username)
        except User.DoesNotExist:
            user_model = User(username=username)
            user_model.save()

        # Set the token the same as the GenePattern token
        try:
            token_model = Token.objects.get(user=user_model)
            token_model.delete()
        except:
            # Ignore
            pass

        try:
            token_model = Token(user=user_model, key=token)
            token_model.save()
        except BaseException as e:
            raise exceptions.AuthenticationFailed(e)

        # Return the user object and token.key
        return (user_model, token)
