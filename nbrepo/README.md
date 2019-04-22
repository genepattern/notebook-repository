# GenePattern Notebook Repository Web Service
This web service runs alongside JupyterHub. It handles requests that are not 
supported by Jupyter, but which expand the functionality available to the 
GenePattern Notebook Repository.

In the future JupyterHub has a services API in development. This would be a 
good candidate for integrating with that API once it is available.

## Python Package Requirements (all available through PIP)
* django == 1.10
* markdown==2.6.6
* djangorestframework == 3.4.4
* django-filter==0.14.0
* django-crispy-forms==1.6.0
* django-cors-middleware == 1.3.1
* pyppeteer==0.0.25
* requests==2.21.0
* jupyterhub==0.9.4

## Installation
1. Install the required packages (listed above).
2. Clone this repository in the directory where you want to run the service.
3. Edit `nbrepo/settings.py` and set the four configuration variables in the 
`Notebook Repository` section at the bottom.
    a. `BASE_GENEPATTERN_URL` is the URL to the GenePattern authentication endpoint. 
    In the future this should be refactored to accept any genetic auth endpoint.
    b. `BASE_REPO_PATH` is the directory where the public notebooks will be saved.
    c. `BASE_SHARE_PATH` is the directory where the shared notebooks will be saved.
    d. `BASE_USER_PATH` is the directory containing all user workspace directories.
4. Ready the database. Run `./manage.py makemigrations` and `./manage.py migrate`
5. Copy the static resources in `notebook-repository/jupyterhub/singleuser/static/repo`
to the `static` directory of the Jupyter singleuser server.
6. Edit `custom.js` and `custom.css` to load the static resources. An example of this is
given in `notebook-repository/custom/`.
7. Start the webservice `./manage.py runserver 0.0.0.0`.
