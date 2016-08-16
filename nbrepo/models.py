from django.db import models


class Notebook(models.Model):
    name = models.CharField(max_length=64)
    description = models.CharField(max_length=256)
    author = models.CharField(max_length=128)
    quality = models.CharField(max_length=32)

    publication = models.DateField()

    owner = models.CharField(max_length=128)
    file_path = models.CharField(max_length=256)
    api_path = models.CharField(max_length=256)
