import ntpath
import os
import urllib
import urllib.parse
import json
import logging
import shutil

from django.contrib.auth.models import User, Group
from django.conf import settings
from django.db.models import ObjectDoesNotExist

from rest_framework import parsers
from rest_framework import permissions
from rest_framework import renderers
from rest_framework import status
from rest_framework import viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from nbrepo.models import Notebook
from nbrepo.serializers import UserSerializer, GroupSerializer, NotebookSerializer, AuthTokenSerializer

from .sharing import CollaboratorViewSet, SharingViewSet, accept_sharing, begin_sharing, error_redirect



# Get an instance of a logger
logger = logging.getLogger(__name__)


class UserViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows users to be viewed or edited.
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer


class GroupViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows groups to be viewed or edited.
    """
    queryset = Group.objects.all()
    serializer_class = GroupSerializer


class NotebookViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows notebooks to be viewed or edited.
    """
    queryset = Notebook.objects.all()
    serializer_class = NotebookSerializer
    filter_fields = ('name', 'author', 'quality', 'owner', 'file_path', 'api_path')
    permission_classes = (permissions.IsAuthenticatedOrReadOnly,)

    @staticmethod
    def _copy_to_file_path(username, model_id, api_path):
        base_repo_path = settings.BASE_REPO_PATH
        base_user_path = os.path.join(settings.BASE_USER_PATH, username)

        # Get the file name and path
        api_path_parts = api_path.split('/')
        file_name = urllib.parse.unquote(api_path_parts[len(api_path_parts)-1])
        file_path = urllib.parse.unquote(api_path.split('/', 4)[4])

        # Path to the user's notebook file
        user_nb_path = os.path.join(base_user_path, file_path)

        # Path to the repo's notebook file
        repo_nb_path = os.path.join(base_repo_path, username, str(model_id), file_name)

        # Lazily create directories and copy the file
        os.makedirs(os.path.dirname(repo_nb_path), exist_ok=True)
        shutil.copy(user_nb_path, repo_nb_path)

        return repo_nb_path

    @staticmethod
    def _remove_notebook_file(file_path):
        id_dir = os.path.dirname(file_path)

        # Safety check: We don't want a badly formatted file path to tell the repository to
        # recursively delete the root directory!!! Make sure that the path we're going to
        # delete starts with the base repo bath. Otherwise error.

        if id_dir.startswith(settings.BASE_REPO_PATH):
            shutil.rmtree(id_dir, ignore_errors=True)
        else:
            logger.debug("ERROR: Trying to delete stuff it shouldn't! " + id_dir)

    def create(self, request, *args, **kwargs):
        logger.debug("CREATE NOTEBOOK")

        # Create initial model and response
        response = super(NotebookViewSet, self).create(request, *args, **kwargs)

        # Get the model ID and API path
        username = response.data['owner']
        new_id = response.data['id']
        api_path = response.data['api_path']

        # Copy the notebook to the file path
        response.data['file_path'] = self._copy_to_file_path(username, new_id, api_path)

        # Update notebook model with the real file path
        notebook = Notebook.objects.get(id=new_id)
        notebook.file_path = response.data['file_path']
        notebook.save()

        # Return response
        return response

    def update(self, request, *args, **kwargs):
        logger.debug("UPDATE NOTEBOOK")

        # Create updated model and response
        response = super(NotebookViewSet, self).update(request, *args, **kwargs)

        # Get the model ID and API path
        username = response.data['owner']
        old_id = response.data['id']
        api_path = response.data['api_path']

        # Copy the notebook to the file path
        self._copy_to_file_path(username, old_id, api_path)

        # Return response
        return response

    def destroy(self, request, *args, **kwargs):
        logger.debug("DESTROY NOTEBOOK")

        # Get the model file path
        notebook = self.get_object()
        file_path = notebook.file_path

        # Delete the model
        response = super(NotebookViewSet, self).destroy(request, *args, **kwargs)

        # Remove the notebook from the file system
        self._remove_notebook_file(file_path)

        # Return response
        return response


@api_view(['POST'])
@permission_classes((permissions.IsAuthenticatedOrReadOnly,))
def copy(request, pk, api_path):
    """
    Copy a notebook from the repository to the user directory
    """
    try:
        # Get the notebook
        notebook = Notebook.objects.get(pk=pk)

        # Get the user's username
        username = request.user.username

        # Get the user's current directory
        base_user_path = os.path.join(settings.BASE_USER_PATH, username)
        copy_to_dir = os.path.join(base_user_path, urllib.parse.unquote(api_path))
        if not copy_to_dir.endswith('/'):
            copy_to_dir += '/'

        # Ensure that the directory exists
        if not (os.path.exists(copy_to_dir) and os.path.isdir(copy_to_dir)):
            return Response("Directory does not exist", status=status.HTTP_400_BAD_REQUEST)

        # Handle file name collisions
        file_name = ntpath.basename(notebook.file_path)
        file_name_used = file_name
        copy_to_file = os.path.join(copy_to_dir, file_name)
        if os.path.exists(copy_to_file):
            count = 1
            file_name_used = 'copy' + str(count) + '_' + file_name
            copy_to_file = os.path.join(copy_to_dir, file_name_used)
            while os.path.exists(copy_to_file):
                count += 1
                file_name_used = 'copy' + str(count) + '_' + file_name
                copy_to_file = os.path.join(copy_to_dir, file_name_used)

        # Copy the notebook to the current directory
        shutil.copyfile(notebook.file_path, copy_to_file)
        os.chmod(copy_to_file, 0o777)

        # Get the URL to the new copy of the notebook file
        copy_url = "/notebooks/" + api_path
        if not copy_url.endswith('/'):
            copy_url += '/'
        copy_url += urllib.parse.quote(file_name_used)

        # Return a JSON object containing the file name and new URL
        return_obj = {"filename": file_name_used, "url": copy_url}
        return Response(json.dumps(return_obj))

    except ObjectDoesNotExist:
        return Response("Notebook does not exist", status=status.HTTP_400_BAD_REQUEST)


class ObtainAuthToken(APIView):
    throttle_classes = ()
    permission_classes = ()
    parser_classes = (parsers.FormParser, parsers.MultiPartParser, parsers.JSONParser,)
    renderer_classes = (renderers.JSONRenderer,)
    serializer_class = AuthTokenSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        return Response({'token': token.key})


obtain_auth_token = ObtainAuthToken.as_view()