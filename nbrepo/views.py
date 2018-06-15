import ntpath
import os
import urllib
import urllib.parse
import json
import logging
import shutil
from distutils.dir_util import copy_tree
from distutils.errors import DistutilsFileError

import nbconvert
import nbformat

from django.contrib.auth.models import User, Group
from django.conf import settings
from django.db.models import ObjectDoesNotExist
from django.views.static import serve

from rest_framework import parsers
from rest_framework import permissions
from rest_framework import renderers
from rest_framework import status
from rest_framework import viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from nbrepo.models import Notebook, Tag
from nbrepo.serializers import UserSerializer, GroupSerializer, NotebookSerializer, AuthTokenSerializer, TagSerializer

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
        if settings.DEBUG:  # Handle dev environment
            file_path = urllib.parse.unquote(api_path.split('/', 2)[2])
        else:
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

    def _apply_tags(self, notebook, tag_list):
        # Clear the existing tags
        notebook.tags.clear()

        # Add the new tag list
        for tag in tag_list:
            notebook.tags.add(tag)

    @staticmethod
    def _get_or_create_tags(tag_list):
        tag_obj_list = []
        for tag_str in tag_list:
            tag_obj, new = Tag.objects.get_or_create(label=tag_str)
            tag_obj_list.append(tag_obj)

        return tag_obj_list

    def _validate_tags(self, request):
        # Get the list of raw tags
        tags_str = request.data['tags']
        tags_list = tags_str.split(',')

        # Lowercase normalize the tags
        tags_list = [x.lower() for x in tags_list]

        # Remove empty tags
        for tag in tags_list:
            if not tag.strip():
                tags_list.remove(tag)

        # Remove all duplicates in the list
        tags_list = list(set(tags_list))

        # Convert tag strings to tag objects
        tags_list = self._get_or_create_tags(tags_list)

        # Filter out protected tags, if not whitelisted
        if request.user.username not in settings.CAN_SET_PROTECTED_TAGS:
            for tag in tags_list:
                if tag.protected:
                    tags_list.remove(tag)

        # Return the list of validated tag objects
        return tags_list

    @staticmethod
    def generate_preview(nb_file_path):
        # Obtain the file paths
        dir_path = os.path.dirname(nb_file_path)
        preview_path = os.path.join(dir_path, 'preview')

        # Generate the preview
        html_exporter = nbconvert.HTMLExporter()
        html_exporter.template_path = ['.', os.path.join(os.path.dirname(os.path.abspath(__file__)),  'preview')]
        html_exporter.template_file = 'genepattern'
        output, resources = html_exporter.from_file(nb_file_path)

        # Set the notebook name in the metadata
        # nb_name = os.path.splitext(os.path.basename(nb_file_path))[0]
        # resources['metadata']['name'] = nb_name

        # Write to disk
        writer = nbconvert.writers.FilesWriter()
        writer.write(output, resources, preview_path)

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

        # Generate the static preview
        self.generate_preview(response.data['file_path'])

        # Update notebook model with the real file path
        notebook = Notebook.objects.get(id=new_id)
        notebook.file_path = response.data['file_path']

        # Update the notebook's tags
        valid_tags = self._validate_tags(request)
        self._apply_tags(notebook, valid_tags)

        # Save the notebook
        notebook.save()

        # Return response
        return response

    def update(self, request, *args, **kwargs):
        logger.debug("UPDATE NOTEBOOK")

        # Update the notebook's tags
        valid_tags = self._validate_tags(request)
        self._apply_tags(self.get_object(), valid_tags)

        # Create updated model and response
        response = super(NotebookViewSet, self).update(request, *args, **kwargs)

        # Get the model ID and API path
        username = response.data['owner']
        old_id = response.data['id']
        api_path = response.data['api_path']

        # Copy the notebook to the file path
        self._copy_to_file_path(username, old_id, api_path)

        # Generate the static preview
        self.generate_preview(response.data['file_path'])

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


class TagViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows tags to be viewed or edited.
    """
    queryset = Tag.objects.all()
    serializer_class = TagSerializer


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


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def preview(request, pk):
    # Get the notebook model
    notebook = Notebook.objects.get(pk=pk)

    # Lazily generate preview.html, if necessary
    preview_path = os.path.join(os.path.dirname(notebook.file_path), 'preview.html')
    if not os.path.exists(preview_path) or not settings.JUPYTERHUB:
        NotebookViewSet.generate_preview(notebook.file_path)

    # Serve the file
    response = serve(request, 'preview.html', os.path.dirname(notebook.file_path))
    return response


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def download(request, pk):
    # Get the notebook model
    notebook = Notebook.objects.get(pk=pk)

    # Serve the file
    response = serve(request, os.path.basename(notebook.file_path), os.path.dirname(notebook.file_path))
    response['Content-Disposition'] = 'attachment; filename="%s"' % os.path.basename(notebook.file_path)
    return response


@api_view(['POST'])
@permission_classes((permissions.IsAuthenticatedOrReadOnly,))
def migrate_account(request, old_user, new_user):
    # Check for nulls or empty usernames
    if old_user is None or old_user.strip() == '':
        return Response('Old username is invalid', status=status.HTTP_400_BAD_REQUEST)
    if new_user is None or new_user.strip() == '':
        return Response('New username is invalid', status=status.HTTP_400_BAD_REQUEST)

    # Get the path to the old and new user directories
    old_dir = os.path.join(settings.OLD_ACCOUNTS_BASE_DIR, old_user) if settings.JUPYTERHUB else settings.OLD_ACCOUNTS_BASE_DIR
    new_dir = os.path.join(settings.BASE_USER_PATH, old_user) if settings.JUPYTERHUB else settings.BASE_USER_PATH

    # Check that both paths exist
    if not os.path.exists(old_dir):
        return Response('Old user does not exist', status=status.HTTP_400_BAD_REQUEST)
    if not os.path.exists(new_dir):
        return Response('New user does not exist', status=status.HTTP_400_BAD_REQUEST)

    # Copy contents of old directory to the new directory
    try:
        copy_tree(old_dir, new_dir, update=1)
    except DistutilsFileError as e:
        # Ignore errors from broken symlinks or non-normal files, they just won't be copied
        pass

    # Everything worked, return
    return Response(old_user + ' copied to ' + new_user)


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