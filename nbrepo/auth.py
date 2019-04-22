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
