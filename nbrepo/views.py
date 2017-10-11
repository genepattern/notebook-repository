import hashlib
import ntpath
import os
import random
import re
import smtplib
import urllib
import urllib.parse
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from django.contrib.auth.models import User, Group
from django.conf import settings
import json
from django.db.models import ObjectDoesNotExist
from django.shortcuts import redirect, render
from rest_framework import parsers
from rest_framework import permissions
from rest_framework import renderers
from rest_framework import status
from rest_framework import viewsets
import shutil

from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from nbrepo.models import Notebook, Share, Collaborator
from nbrepo.serializers import UserSerializer, GroupSerializer, NotebookSerializer, AuthTokenSerializer, SharingSerializer, CollaboratorSerializer
import logging


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


class SharingViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows notebooks to be viewed or edited.
    """
    queryset = Share.objects.all()
    serializer_class = SharingSerializer
    filter_fields = ('owner', 'name', 'file_path', 'api_path', )
    permission_classes = (permissions.AllowAny, )


class CollaboratorViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows notebooks to be viewed or edited.
    """
    queryset = Collaborator.objects.all()
    serializer_class = CollaboratorSerializer
    filter_fields = ('name', 'token', 'accepted', )
    permission_classes = (permissions.AllowAny, )


class NotebookViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows notebooks to be viewed or edited.
    """
    queryset = Notebook.objects.all()
    serializer_class = NotebookSerializer
    filter_fields = ('name', 'author', 'quality', 'owner', 'file_path', 'api_path')

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


def _api_to_file_path(username, api_path):
    if settings.JUPYTERHUB:
        base_user_path = os.path.join(settings.BASE_USER_PATH, username)
    else:
        base_user_path = settings.BASE_USER_PATH

    # Path to the user's notebook file
    return os.path.join(base_user_path, api_path)


def _remove_api_prefix(nb_path):
    if nb_path.startswith("/notebooks/"):
        return nb_path[11:]


def _is_email(email):
    if len(email) > 7:
        if re.match("^[_a-z0-9-]+(\.[_a-z0-9-]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]{2,4})$", email.lower()) is not None:
            return True
    return False


def _generate_token():
    token = hashlib.md5()
    token.update(str(random.random()).encode('utf-8'))
    return token.hexdigest()


def _send_email(from_email, to_email, subject, message):
    msg = MIMEMultipart()
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(message, 'html'))

    server = smtplib.SMTP('localhost', 25)
    text = msg.as_string()
    server.sendmail(from_email, to_email.split(', '), text)
    server.quit()


def _create_collaborator(nb, name_or_email):
    name = ''
    email = ''

    # Guess if provided with name or email
    is_email = _is_email(name_or_email)
    if is_email:
        email = name_or_email
    else:
        name = name_or_email

    # If invalid username, throw an error
    # TODO: Implement better check
    if not is_email:
        try:
            u = User.objects.get(username=name.lower())
            email = '' if u.email is None else u.email
        except User.DoesNotExist:
            raise Exception("Unknown user")

    # Otherwise, create the collaborator
    c = Collaborator()
    c.share = nb
    c.name = name
    c.email = email
    c.token = _generate_token()
    c.accepted = False
    c.save()

    # If email or user has known email, send an email to the user
    if email:
        domain = 'https://notebook.genepattern.org' if settings.JUPYTERHUB else 'http://localhost'

        _send_email("gp-help@broadinstitute.org", email, "Notebook Sharing Invite - GenePattern Notebook Repository", """
        <p>You've been invited to share a notebook on the GenePattern Notebook Repository. To accept, just sign in and then click the link below.</p>
        
        <h5>GenePattern Notebook Repository</h5>
        <p><a href="https://notebook.genepattern.org">https://notebook.genepattern.org</a></p>
        
        <h5>Click below to accept shared notebook</h5>
        <p><a href="%s:8000/sharing/%s/accept/%s">%s:8000/sharing/%s/accept/%s</a></p>
        """ % (domain, c.share.id, c.token, domain, c.share.id, c.token))


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def current_collaborators(request, api_path):
    nb_path = _remove_api_prefix(urllib.parse.unquote('/' + api_path))
    matches = Collaborator.objects.filter(share__api_path=nb_path)

    return_list = []
    for c in matches:
        if c.name and c.email:
            return_list.append(c.name)
        elif c.name:
            return_list.append(c.name)
        elif c.email:
            return_list.append(c.email)

    return_obj = {"shared_with": return_list}
    return Response(json.dumps(return_obj))


@api_view(['POST'])
@permission_classes((permissions.AllowAny,))
def begin_sharing(request):
    nb_path = request.POST['notebook'] if 'notebook' in request.POST else None
    users = request.POST['share_with'].split(',') if 'share_with' in request.POST and request.POST['share_with'] != '' else []
    owner = request.POST['shared_by'] if 'shared_by' in request.POST else None

    # Escape nb_path
    nb_path = _remove_api_prefix(urllib.parse.unquote(nb_path))

    # Handle the case of sharing with nobody
    if nb_path is None or users is None or owner is None:
        return_obj = {"error": "Unable to share notebook."}
        return Response(json.dumps(return_obj), status=400)

    # Get the database entry for the notebook
    notebook = None
    try:
        notebook = Share.objects.get(api_path=nb_path)

    # Lazily create one if one does not already exist
    except Share.DoesNotExist:
        notebook = Share()
        notebook.owner = owner
        notebook.name = nb_path.split('/')[-1]
        notebook.file_path = _api_to_file_path(owner, nb_path)
        notebook.api_path = nb_path
        notebook.save()

    # Get the list of collaborators for the notebook
    collaborators = Collaborator.objects.filter(share=notebook)
    existing = []
    for c in collaborators:
        if c.name:
            existing.append(c.name)
        if c.email:
            existing.append(c.email)

    # Figure out which need added
    need_added = []
    for user in users:
        if user not in existing:
            need_added.append(user)

    # Figure out which need removed
    need_removed = []
    for user in collaborators:
        if user.email not in users and user.name not in users:
            need_removed.append(user)

    # Remove collaborators as necessary
    for user in need_removed:
        user.delete()

    # Add collaborators as necessary
    user_errors =[]
    for user in need_added:
        try:
            _create_collaborator(notebook, user)
        except Exception as e:
            user_errors.append(user)

    # If any users get an error message, return an error
    if len(user_errors) > 0:
        return_obj = {"error": "Unable to share with the indicated users", 'users': user_errors}
        return Response(return_obj, status=400)

    # Otherwise, assume everything is good
    return_obj = {"success": "Notebook sharing updated"}
    return Response(json.dumps(return_obj))


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def error_redirect(request):
    # Could not find message parameter, use default
    if 'message' not in request.GET:
        message = "Something went wrong."
    else:
        message = request.GET['message']

    return render(request, "error.html", context={"message": message})


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def accept_sharing(request, pk, token):
    # Look up the sharing entry
    share = None
    try:
        share = Share.objects.get(id=pk)
    except Share.DoesNotExist:
        return redirect("/error/?" + urllib.parse.urlencode({"message": "Could not located shared notebook."}))

    # Verify the token
    try:
        collaborator = Collaborator.objects.get(share=share, token=token)
    except Collaborator.DoesNotExist:
        return redirect("/error/?" + urllib.parse.urlencode({"message": "Unable to verify provided token."}))

    # If not yet accepted
    if not collaborator.accepted:

        # Lazily create the sharing directory
        if settings.JUPYTERHUB:
            user_directory = os.path.join(settings.BASE_USER_PATH, request.user.username)
        else:
            user_directory = settings.BASE_USER_PATH

        sharing_directory = os.path.join(user_directory, 'Shared')

        if not os.path.exists(sharing_directory):
            os.makedirs(sharing_directory)

        # Soft link the shared notebook, throw an error if already exists
        notebook_link = os.path.join(sharing_directory, share.name)

        if os.path.exists(notebook_link):
            if settings.JUPYTERHUB:
                return redirect("/error/?" + urllib.parse.urlencode({"message": "Unable to link notebook. " +
                                                                                "A notebook with that name already exists in the sharing directory."}))
        else:
            os.symlink(share.file_path, notebook_link)

        # Initialize the collaborator's name, if necessary
        if not collaborator.name:
            collaborator.name = request.user.username

        # Mark the collaborator as having accepted
        collaborator.accepted = True
        collaborator.save()

    # Redirect to the sharing directory
    if settings.JUPYTERHUB:
        return redirect("https://notebook.genepattern.org/hub/%s/tree/Shared" % request.user.username)
    else:
        return redirect("http://localhost:8888/tree/Shared")


@api_view(['POST'])
@permission_classes((permissions.AllowAny,))
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