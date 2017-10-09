from django.db import models
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver


class Notebook(models.Model):
    name = models.CharField(max_length=64)
    description = models.CharField(max_length=256)
    author = models.CharField(max_length=128)
    quality = models.CharField(max_length=32)

    publication = models.DateField()

    owner = models.CharField(max_length=128)
    file_path = models.CharField(max_length=256)
    api_path = models.CharField(max_length=256)


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


# Create tokens for all users
@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_auth_token(sender, instance=None, created=False, **kwargs):
    if created:
        Token.objects.create(user=instance)
