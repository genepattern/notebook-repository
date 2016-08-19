from django.contrib.auth.models import User, Group
from rest_framework import viewsets, generics, filters
from nbrepo.models import Notebook
from nbrepo.serializers import UserSerializer, GroupSerializer, NotebookSerializer


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

    def create(self, request, *args, **kwargs):
        print("CREATE NOTEBOOK")
        return super(NotebookViewSet, self).create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        print("UPDATE NOTEBOOK")
        return super(NotebookViewSet, self).update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        print("DESTROY NOTEBOOK")
        return super(NotebookViewSet, self).destroy(request, *args, **kwargs)
