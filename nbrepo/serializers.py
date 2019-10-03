from django.contrib.auth.models import User, Group
from rest_framework import serializers
from nbrepo.models import Notebook, Tag, Webtour, Comment
from .sharing import CollaboratorSerializer, SharingSerializer


class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = ('url', 'username', 'email', 'is_staff', 'groups')


class GroupSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ('url', 'name')


class TagSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Tag
        fields = ('id', 'label', 'protected', 'pinned', 'weight', 'description')


class WebtourSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Webtour
        fields = ('user', 'seen')


class CommentSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Comment
        fields = ('notebook', 'user', 'timestamp', 'text')


class NotebookSerializer(serializers.HyperlinkedModelSerializer):
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = Notebook
        fields = ('id', 'url', 'name', 'description', 'author', 'quality', 'publication', 'owner', 'file_path', 'api_path', 'weight', 'tags')


class AuthTokenSerializer(serializers.Serializer):

    def update(self, instance, validated_data):
        return super(AuthTokenSerializer, self).update(instance, validated_data)

    def create(self, validated_data):
        return super(AuthTokenSerializer, self).create(validated_data)

    username = serializers.CharField(label="Username")
    password = serializers.CharField(label="Password", style={'input_type': 'password'})

    def validate(self, attrs):
        username = attrs.get('username')

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            user = None

        if user:
            if not user.is_active:
                msg = 'User account is disabled.'
                raise serializers.ValidationError(msg)
        else:
            msg = 'Unable to log in with provided credentials.'
            raise serializers.ValidationError(msg)

        attrs['user'] = user
        return attrs
