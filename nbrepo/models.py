from django.db import models
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from .sharing import Collaborator, Share


class Tag(models.Model):
    label = models.CharField(max_length=64)
    protected = models.BooleanField(default=False)
    weight = models.IntegerField(default=0)
    pinned = models.BooleanField(default=False)


class Notebook(models.Model):
    name = models.CharField(max_length=64)
    description = models.CharField(max_length=256)
    author = models.CharField(max_length=128)
    quality = models.CharField(max_length=32)

    publication = models.DateField()

    owner = models.CharField(max_length=128)
    file_path = models.CharField(max_length=256)
    api_path = models.CharField(max_length=256)

    weight = models.IntegerField(default=0)
    tags = models.ManyToManyField(Tag)


class Webtour(models.Model):
    user = models.CharField(max_length=128)
    seen = models.BooleanField(default=False)


class Comment(models.Model):
    notebook = models.ForeignKey(Notebook, on_delete=models.CASCADE)
    user = models.CharField(max_length=128)
    timestamp = models.DateTimeField()
    text = models.TextField(blank=False)


# Create tokens for all users
@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_auth_token(sender, instance=None, created=False, **kwargs):
    if created:
        Token.objects.create(user=instance)
