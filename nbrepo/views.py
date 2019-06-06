import ntpath
import os
import urllib
import urllib.parse
import json
import logging
import shutil
from distutils.dir_util import copy_tree
from distutils.errors import DistutilsFileError

from django.contrib.auth.models import User, Group
from django.conf import settings
from django.db.models import ObjectDoesNotExist
from django.shortcuts import redirect
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

from nbrepo.models import Notebook, Tag, Webtour, Comment
from nbrepo.serializers import UserSerializer, GroupSerializer, NotebookSerializer, AuthTokenSerializer, TagSerializer, WebtourSerializer, CommentSerializer
from .preview import preview, generate_preview

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


class WebtourViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows webtour seen to be set
    """
    queryset = Webtour.objects.all()
    serializer_class = WebtourSerializer
    filter_fields = ('user', 'seen')
    permission_classes = (permissions.IsAuthenticatedOrReadOnly,)


class CommentViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows webtour seen to be set
    """
    queryset = Comment.objects.all()
    serializer_class = CommentSerializer
    filter_fields = ('notebook', 'user', 'timestamp', 'text')
    permission_classes = (permissions.IsAuthenticatedOrReadOnly,)


class NotebookViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows notebooks to be viewed or edited.
    """
    queryset = Notebook.objects.all()
    serializer_class = NotebookSerializer
    filter_fields = ('name', 'author', 'quality', 'owner', 'file_path', 'api_path')
    permission_classes = (permissions.IsAuthenticatedOrReadOnly,)

    @staticmethod
    def _add_publish_metadata(nb_path, nb_url):
        try:
            with open(nb_path, 'r') as nb_read:
                # Get the metadata
                nb_json = json.load(nb_read)
                nb_read.close()
                nb_metadata = nb_json['metadata']

                # Get the GenePattern metadata
                if 'genepattern' not in nb_metadata:
                    nb_metadata['genepattern'] = {}
                nb_genepattern = nb_metadata['genepattern']

                # Set the repository_url
                nb_genepattern['repository_url'] = nb_url

                # Write back to the file
                with open(nb_path, 'w') as nb_write:
                    json.dump(nb_json, nb_write)
                    nb_write.close()

        except FileNotFoundError:
            logger.error("Cannot open " + str(nb_path))
        except KeyError:
            logger.error("Cannot get metadata for " + str(nb_path))

    @staticmethod
    def _user_file_path(username, api_path):
        base_user_path = os.path.join(settings.BASE_USER_PATH, username)

        if not settings.JUPYTERHUB:  # Handle dev environment
            file_path = urllib.parse.unquote(api_path.split('/', 2)[2])
        else:
            file_path = urllib.parse.unquote(api_path.split('/', 4)[4])

        # Path to the user's notebook file
        user_nb_path = os.path.join(base_user_path, file_path)
        return user_nb_path

    @staticmethod
    def _copy_to_file_path(username, model_id, api_path):
        base_repo_path = settings.BASE_REPO_PATH

        # Get the file name and path
        api_path_parts = api_path.split('/')
        file_name = urllib.parse.unquote(api_path_parts[len(api_path_parts) - 1])
        user_nb_path = NotebookViewSet._user_file_path(username, api_path)

        # Path to the repo's notebook file
        repo_nb_path = os.path.join(base_repo_path, username, str(model_id), file_name)

        # Lazily create directories and copy the file
        if os.path.exists(user_nb_path):
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

    def create(self, request, *args, **kwargs):
        logger.debug("CREATE NOTEBOOK")

        # Create initial model and response
        response = super(NotebookViewSet, self).create(request, *args, **kwargs)

        # Get the model ID and API path
        username = response.data['owner']
        new_id = response.data['id']
        api_path = response.data['api_path']

        # Get the path to the user's copy
        user_file_path = self._user_file_path(username, api_path)

        # Copy the notebook to the file path
        response.data['file_path'] = self._copy_to_file_path(username, new_id, api_path)

        # Generate the static preview
        generate_preview(response.data['file_path'])

        # Update notebook model with the real file path
        notebook = Notebook.objects.get(id=new_id)
        notebook.file_path = response.data['file_path']

        # Update the notebook's tags
        valid_tags = self._validate_tags(request)
        self._apply_tags(notebook, valid_tags)

        # Save the notebook
        notebook.save()

        # Insert the publishing metadata in the notebook file
        self._add_publish_metadata(user_file_path, response.data['url'])      # Add to user's copy
        self._add_publish_metadata(notebook.file_path, response.data['url'])  # Add to canonical copy

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
        generate_preview(response.data['file_path'])

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


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def webtour_seen(request, user):
    # Get the notebook model
    webtours = Webtour.objects.filter(user=user)

    # If haven't been seen
    if len(webtours.all()) < 1:
        # Mark is as seen
        wt = Webtour()
        wt.user = user
        wt.seen = True
        wt.save()

        # Return the response
        return Response({'seen': False})

    # If it has been seen
    else:
        return Response({'seen': True})


class TagViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows tags to be viewed or edited.
    """
    queryset = Tag.objects.all()
    serializer_class = TagSerializer


@api_view(['PUT'])
@permission_classes((permissions.AllowAny,))
def launch_counter(request, pk):
    # Get the notebook and increment the counter
    notebook = Notebook.objects.get(pk=pk)
    notebook.launched += 1
    notebook.save()

    # Return an OK response
    return Response("OK")


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def notebook_usage(request):
    # Get all notebooks
    notebooks = Notebook.objects.all()

    # Create the usage object to report
    usage = {}

    # Loop over all notebooks
    for nb in notebooks:
        # Create the report object for each notebook
        report = {'copied': nb.copied, 'launched': nb.launched}

        # Add the report to the usage object
        usage[nb.name] = report

    # Return the report in a JSON structure
    return Response(usage)


@api_view(['GET', 'POST'])
@permission_classes((permissions.IsAuthenticatedOrReadOnly,))
def copy(request, pk, api_path):
    """
    Copy a notebook from the repository to the user directory
    """
    try:
        # Get the notebook
        notebook = Notebook.objects.get(pk=pk)

        # Increment the copied counter
        notebook.copied += 1
        notebook.save()

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

        # If "open" flag is set, redirect to the notebook
        if request.GET.get('open', False):
            return redirect('/user/' + username + copy_url)

        # Return a JSON object containing the file name and new URL
        return_obj = {"filename": file_name_used, "url": copy_url}
        return Response(json.dumps(return_obj))

    except ObjectDoesNotExist:
        return Response("Notebook does not exist", status=status.HTTP_400_BAD_REQUEST)


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
        return Response({'token': token.key, 'admin': user.username in settings.CAN_SET_PROTECTED_TAGS})


obtain_auth_token = ObtainAuthToken.as_view()