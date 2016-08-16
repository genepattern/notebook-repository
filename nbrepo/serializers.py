from django.contrib.auth.models import User, Group
from rest_framework import serializers
from nbrepo.models import Notebook


class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = ('url', 'username', 'email', 'is_staff', 'groups')


class GroupSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ('url', 'name')


class NotebookSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Notebook
        fields = ('url', 'name', 'description', 'author', 'quality', 'publication', 'owner', 'file_path', 'api_path')
