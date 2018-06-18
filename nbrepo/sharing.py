import hashlib
import json
import os
import random
import re
import smtplib
import time
import urllib
import urllib.parse
from datetime import datetime

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from shutil import copyfile

from django.conf import settings
from django.conf.urls import url
from django.contrib.auth.models import User
from django.shortcuts import redirect, render, get_object_or_404
from django.db import models

from rest_framework import permissions
from rest_framework import serializers
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response


# This file contains experimental notebook sharing code.
# This code is not yet functional in production.

##################
# From models.py #
##################


class Share(models.Model):
    name = models.CharField(max_length=64)          # Name of the notebook
    last_updated = models.DateTimeField(null=True)  # Timestamp of the last publish

    # The file path to the published copy of the notebook, relative to settings.BASE_SHARE_PATH
    # Will usually be: [settings.BASE_SHARE_PATH/] owner_username/owner_file_path
    api_path = models.CharField(max_length=256)

    def __str__(self):
        return self.api_path


class Collaborator(models.Model):
    share = models.ForeignKey(Share, on_delete=models.CASCADE, related_name='shared_with')
    user = models.CharField(max_length=64)
    owner = models.BooleanField(default=False)

    email = models.CharField(max_length=128)
    token = models.CharField(max_length=128)
    accepted = models.BooleanField(default=False)

    # The file path for the linked file for this particular user, relative to the user's directory
    file_path = models.CharField(max_length=256, null=True)

    def __str__(self):
        return str(self.share) + ' (' + self.email + ')'


#######################
# From serializers.py #
#######################


class SharingSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Share
        fields = ('url', 'id', 'name', 'last_updated', 'api_path', 'shared_with')


class CollaboratorSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Collaborator
        fields = ('share', 'user', 'owner', 'email', 'token', 'accepted', 'file_path')


#################
# From views.py #
#################


class SharingViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows notebooks to be viewed or edited.
    """
    queryset = Share.objects.all()
    serializer_class = SharingSerializer
    filter_fields = ('name', 'api_path', )
    permission_classes = (permissions.AllowAny, )


class CollaboratorViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows notebooks to be viewed or edited.
    """
    queryset = Collaborator.objects.all()
    serializer_class = CollaboratorSerializer
    filter_fields = ('user', 'owner', 'token', 'accepted', 'file_path', )
    permission_classes = (permissions.AllowAny, )


def _create_new_share(owner, api_path, file_path):
    notebook = Share()
    notebook.name = api_path.split('/')[-1]
    notebook.api_path = api_path
    notebook.last_updated = datetime.now()
    notebook.save()

    # Add the owner as a collaborator
    owner_collaborator = Collaborator()
    owner_collaborator.share = notebook
    owner_collaborator.user = owner
    owner_collaborator.owner = True
    owner_collaborator.accepted = True
    owner_collaborator.file_path = file_path
    owner_collaborator.save()

    return notebook


def _sync_collaborators(notebook, users):
    # Get the list of collaborators for the notebook
    collaborators = Collaborator.objects.filter(share=notebook)
    existing = []
    for c in collaborators:
        if c.user:
            existing.append(c.user)
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
        if user.email not in users and user.user not in users and not user.owner:
            need_removed.append(user)

    # Remove collaborators as necessary
    for user in need_removed:
        user.delete()

    # Add collaborators as necessary
    user_errors = []
    for user in need_added:
        try:
            _create_collaborator(notebook, user)
        except Exception as e:
            user_errors.append(user)

    return user_errors


@api_view(['POST'])
@permission_classes((permissions.AllowAny,))
def begin_sharing(request):
    # Path to the notebook relative to the user's home directory
    nb_path = urllib.parse.unquote(request.data['notebook']) if 'notebook' in request.data else None

    # The list of users the notebook is being shared with
    users = request.data['share_with'].split(',') if 'share_with' in request.data and request.data['share_with'] != '' else []

    # The original owner of the notebook
    owner = request.data['shared_by'] if 'shared_by' in request.data else None

    # Escape nb_path and prepend owner
    api_path = str(owner) + '/' + nb_path

    # Handle the case of sharing with nobody
    if not api_path or not users or not owner:
        return_obj = {"error": "Unable to share notebook."}
        return Response(json.dumps(return_obj), status=400)

    # Get the database entry for the notebook
    notebook = None
    try:
        notebook = Share.objects.get(api_path=api_path)

    # Lazily create one if one does not already exist
    except Share.DoesNotExist:
        notebook = _create_new_share(owner, api_path, nb_path)

    # Update the shared notebook on the file system
    try:
        local_path = os.path.join(settings.BASE_USER_PATH, request.user.username, nb_path) if settings.JUPYTERHUB else os.path.join(settings.BASE_USER_PATH, nb_path)
        share_path = os.path.join(settings.BASE_SHARE_PATH, api_path)
        os.makedirs(os.path.dirname(share_path), exist_ok=True)  # Lazily create the directory, if necessary
        copyfile(local_path, share_path)
    except Exception as e:
        return_obj = {"error": "Unable to copy shared notebook. " + str(e)}
        return Response(return_obj, status=400)

    # Sync the collaborators in the request with the collaborators in the database
    user_errors = _sync_collaborators(notebook, users)

    # If any users get an error message, return an error
    if len(user_errors) > 0:
        return_obj = {"error": "Unable to share with the indicated users", 'users': user_errors}
        return Response(return_obj, status=400)

    # Otherwise, assume everything is good
    return_obj = {"success": "Notebook sharing updated"}
    return Response(json.dumps(return_obj))


@api_view(['DELETE'])
@permission_classes((permissions.AllowAny,))
def remove_sharing(request, pk):
    # Look up the sharing entry
    nb = get_object_or_404(Share, id=pk)

    # Get the current username
    username = request.user.username

    # Get the current collaborator
    collaborator = get_object_or_404(Collaborator, user=username, share=nb)

    # Ensure the current user has owner permissions
    if not collaborator.owner:
        return_obj = {"error": "Unable to remove sharing due to user permissions."}
        return Response(return_obj, status=403)

    # Remove the share from the database
    nb.delete()

    # Remove the shared notebook from the file system
    share_path = Path(os.path.join(settings.BASE_SHARE_PATH, nb.api_path))
    share_path.unlink()

    # Otherwise, return a 200 response in the API
    return Response(nb.name + " sharing removed.", status=200)


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def error_redirect(request):
    # Could not find message parameter, use default
    if 'message' not in request.GET:
        message = "Something went wrong."
    else:
        message = request.GET['message']

    return render(request, "error.html", context={"message": message})


@api_view(['GET', 'PUT'])
@permission_classes((permissions.AllowAny,))
def accept_sharing(request, pk):
    # If this was a direct link and not logged in, redirect to the login page
    if request.method == 'GET' and request.user.is_anonymous():
        return redirect('/hub/login?next=/tree?#repository')

    # Look up the sharing entry
    nb = get_object_or_404(Share, id=pk)

    # Get the current username
    username = request.user.username

    # Get the current collaborator
    collaborator = get_object_or_404(Collaborator, user=username, share=nb)

    # Mark sharing as accepted
    collaborator.accepted = True
    collaborator.save()

    # If this was a GET request, redirect to the Public Notebooks tab
    if request.method == 'GET':
        return redirect('/tree?#repository')

    # Otherwise, return a 200 response in the API
    return Response(nb.name + " sharing accepted.", status=200)


@api_view(['PUT'])
@permission_classes((permissions.AllowAny,))
def decline_sharing(request, pk):
    # Look up the sharing entry
    nb = get_object_or_404(Share, id=pk)

    # Get the current username
    username = request.user.username

    # Get the current collaborator
    collaborator = get_object_or_404(Collaborator, user=username, share=nb)

    # Remove the collaborator from the shared notebook
    collaborator.delete()

    # Otherwise, return a 200 response in the API
    return Response(nb.name + " sharing declines.", status=200)


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
    else:
        return None


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
    tries = [0]

    def attempt_sending():
        tries[0] += 1

        try:
            msg = MIMEMultipart()
            msg['From'] = from_email
            msg['To'] = to_email
            msg['Subject'] = subject
            msg.attach(MIMEText(message, 'html'))

            server = smtplib.SMTP('localhost', 25)
            text = msg.as_string()
            server.sendmail(from_email, to_email.split(', '), text)
            server.quit()
        except:
            if tries[0] < 2:
                time.sleep(3)
                attempt_sending()

    attempt_sending()


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
    c.user = name
    c.owner = False
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
    nb_path = urllib.parse.unquote(api_path)
    matches = Collaborator.objects.filter(share__api_path=nb_path)

    return_list = []
    for c in matches:
        if c.user and c.email:
            return_list.append(c.user)
        elif c.user:
            return_list.append(c.user)
        elif c.email:
            return_list.append(c.email)

    return_obj = {"shared_with": return_list}
    return Response(json.dumps(return_obj))


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def shared_with_me(request):
    if request.user:
        username = request.user.username
        c_list = Collaborator.objects.filter(user=username)

        notebook_list = []
        for c in c_list:
            nb = {}
            nb['name'] = c.share.name
            nb['id'] = c.share.id
            nb['api_path'] = c.share.api_path
            nb['my_path'] = c.file_path
            nb['last_updated'] = str(c.share.last_updated)
            nb['owner'] = c.owner
            nb['accepted'] = c.accepted

            collaborator_list = []
            for oc in c.share.shared_with.all():
                collaborator_list.append({
                    'user': oc.user if oc.user else oc.email,
                    'accepted': oc.accepted,
                    'owner': oc.owner
                })
            nb['collaborators'] = collaborator_list

            notebook_list.append(nb)
        return Response(json.dumps(notebook_list))

    else:
        return_obj = {"error": "Must be logged in to have notebooks shared with you."}
        return Response(json.dumps(return_obj), status=401)


@api_view(['PUT'])
@permission_classes((permissions.AllowAny,))
def copy_share(request, pk, local_dir_path):
    # Look up the notebook using pk
    nb = get_object_or_404(Share, id=pk)

    # Get the current username
    username = request.user.username

    # Get the current collaborator
    collaborator = get_object_or_404(Collaborator, user=username, share=nb)

    # Does the collaborator already have a file path? If not, add one
    if not collaborator.file_path:
        collaborator.file_path = os.path.join(local_dir_path, nb.name)
        collaborator.save()

    # Either way, get the local path
    local_path = Path(os.path.join(settings.BASE_USER_PATH, request.user.username, collaborator.file_path)) if settings.JUPYTERHUB else Path(os.path.join(settings.BASE_USER_PATH, collaborator.file_path))

    # Check to see if the notebook exists, if not copy the shared notebook there and return
    if not local_path.exists():
        copyfile(os.path.join(settings.BASE_SHARE_PATH, nb.api_path), str(local_path))
        local_path.chmod(0o777)
        return Response('Shared notebook lazily created', status=200)

    # If it does, get the last updated timestamp of the file
    local_last_updated = local_path.stat().st_mtime

    # Compare last_updated of the file vs. the db entry, if the db entry is newer, overwrite the local file and return
    # Local file older than the repo file
    if local_last_updated < nb.last_updated.timestamp():
        copyfile(os.path.join(settings.BASE_SHARE_PATH, nb.api_path), str(local_path))
        # local_path.chmod(0o777)
        return Response('Updated local copy of shared notebook', status=200)

    # If the local file is newer, copy to the repo
    # Local file newer than the repo file
    else:
        copyfile(str(local_path), os.path.join(settings.BASE_SHARE_PATH, nb.api_path))  # Copy the file
        nb.last_updated = datetime.now()  # Update the database
        nb.save()
        return Response('Keeping local copy of shared notebook', status=200)


################
# From urls.py #
################


urlpatterns = [
    url(r'^services/sharing/sharing/list/$', shared_with_me),
    url(r'^services/sharing/sharing/(?P<pk>[0-9]+)/accept/$', accept_sharing),
    url(r'^services/sharing/sharing/(?P<pk>[0-9]+)/decline/$', decline_sharing),
    url(r'^services/sharing/sharing/(?P<pk>[0-9]+)/remove/$', remove_sharing),
    url(r'^services/sharing/sharing/(?P<pk>[0-9]+)/copy/(?P<local_dir_path>.*)$', copy_share),
    url(r'^services/sharing/sharing/begin/', begin_sharing),
    url(r'^services/sharing/sharing/current/(?P<api_path>.*)$', current_collaborators),
    url(r'^services/sharing/error/$', error_redirect),
]
