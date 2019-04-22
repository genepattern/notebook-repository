import os
import shlex

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.template import loader
from django.views.static import serve
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from nbrepo import settings
from nbrepo.models import Notebook


def generate_preview(nb_file_path):
    # Generate the preview screenshot and save it to the preview directory
    os.system("nbrepo/screenshot.py " + shlex.quote(nb_file_path))


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def preview(request, pk):
    # Get the notebook model
    notebook = get_object_or_404(Notebook, pk=pk)

    # Display the preview template
    template = loader.get_template('preview.html')
    context = {
        'notebook': notebook
    }
    return HttpResponse(template.render(context, request))


@api_view(['GET'])
@permission_classes((permissions.AllowAny,))
def preview_image(request, pk):
    # Get the notebook model
    notebook = Notebook.objects.get(pk=pk)

    # Lazily generate screenshot and preview.html, if necessary
    preview_path = os.path.join(os.path.dirname(notebook.file_path), 'preview.png')
    if not os.path.exists(preview_path) or not settings.JUPYTERHUB:
        generate_preview(notebook.file_path)

    # Serve the file
    response = serve(request, 'preview.png', os.path.dirname(notebook.file_path))
    return response
