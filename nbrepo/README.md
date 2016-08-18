# GenePattern Notebook Repository Web Service
This web service runs alongside JupyterHub. It handles requests that are not 
supported by Jupyter, but which expand the functionality available to the 
GenePattern Notebook Repository.

## Requirements
* django == 1.10
* markdown
* django-filter
* django-crispy-forms
* django-cors-middleware == master (https://github.com/zestedesavoir/django-cors-middleware)
