import hashlib
import json
import os
import random
import re
import smtplib
import time
import urllib
import urllib.parse

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from django.conf import settings
from django.conf.urls import url
from django.contrib.auth.models import User
from django.shortcuts import redirect, render
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
    owner = models.CharField(max_length=128)
    name = models.CharField(max_length=64)

    file_path = models.CharField(max_length=256)
    api_path = models.CharField(max_length=256)

    def __str__(self):
        return self.owner + '/' + self.api_path


class Collaborator(models.Model):
    share = models.ForeignKey(Share, on_delete=models.CASCADE, related_name='shared_with')
    name = models.CharField(max_length=64)
    email = models.CharField(max_length=128)
    token = models.CharField(max_length=128)
    accepted = models.BooleanField(default=False)

    def __str__(self):
        return str(self.share) + ' (' + self.email + ')'


#######################
# From serializers.py #
#######################


class SharingSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Share
        fields = ('id', 'owner', 'file_path', 'api_path', 'shared_with', )


class CollaboratorSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Collaborator
        fields = ('share', 'email', 'name', 'token', 'accepted', )


#################
# From views.py #
#################


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


################
# From urls.py #
################


urlpatterns = [
    url(r'^sharing/begin/', begin_sharing),
    url(r'^sharing/current/(?P<api_path>.*)$', current_collaborators),
    url(r'^sharing/(?P<pk>[0-9]+)/accept/(?P<token>.*)$', accept_sharing),
    url(r'^error/$', error_redirect),
]
