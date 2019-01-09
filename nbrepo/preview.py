import os
import shlex

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
    notebook = Notebook.objects.get(pk=pk)

    # Lazily generate screenshot and preview.html, if necessary
    preview_path = os.path.join(os.path.dirname(notebook.file_path), 'preview.png')
    if not os.path.exists(preview_path) or not settings.JUPYTERHUB:
        generate_preview(notebook.file_path)

    # Serve the file
    response = serve(request, 'preview.png', os.path.dirname(notebook.file_path))
    return response
