# GenePattern Notebook Repository Web Service
This web service runs alongside JupyterHub. It handles requests that are not 
supported by Jupyter, but which expand the functionality available to the 
GenePattern Notebook Repository.

## Requirements
* django == 1.10
* markdown
* djangorestframework == 3.4.4
* django-filter
* django-crispy-forms
* django-cors-middleware == 1.3.1