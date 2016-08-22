from django.contrib.auth.models import User, Group
from django.conf import settings
from rest_framework import viewsets
from nbrepo.models import Notebook
from nbrepo.serializers import UserSerializer, GroupSerializer, NotebookSerializer
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


class NotebookViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows notebooks to be viewed or edited.
    """
    queryset = Notebook.objects.all()
    serializer_class = NotebookSerializer
    filter_fields = ('name', 'author', 'quality', 'owner', 'file_path', 'api_path')

    def _copy_to_file_path(self, id, api_path):
        base_file_path = settings.BASE_REPO_PATH

        return '/fake/file/path'

    def _remove_notebook_file(self, file_path):
        return True

    def create(self, request, *args, **kwargs):
        logger.debug("CREATE NOTEBOOK")

        # Create initial model and response
        response = super(NotebookViewSet, self).create(request, *args, **kwargs)

        # Get the model ID and API path
        new_id = response.data['id']
        api_path = response.data['api_path']

        # Copy the notebook to the file path
        response.data['file_path'] = self._copy_to_file_path(new_id, api_path)

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
        old_id = response.data['id']
        api_path = response.data['api_path']

        # Copy the notebook to the file path
        self._copy_to_file_path(old_id, api_path)

        # Return response
        return response

    def destroy(self, request, *args, **kwargs):
        logger.debug("DESTROY NOTEBOOK")
        response = super(NotebookViewSet, self).destroy(request, *args, **kwargs)

        # Get the model ID and API path
        file_path = response.data['file_path']

        # Remove the notebook from the file system
        self._remove_notebook_file(file_path)

        # Return response
        return response
