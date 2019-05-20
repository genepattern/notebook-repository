# Manually updating the notebook repository database

## Overview

We use Django models to manage the database. Think of them like a Python version of Hibernate. This lets us manipulate
the database in the same way you'd manipulate Python objects, regardless of the underlying SQL implementation.

## Steps

1. SSH into the notebook repository head node.
2. `docker exec -it notebook_repository bash` Shell into the Notebook Repository container.
3. `cd /srv/notebook-repository` Go to the directory with the repository server.
4. `source activate repository` Activate the correct Python environment.
5. `./manage.py shell` Start up an interactive Python shell connecting to the server and database.
6. Import and manipulate the models for the database. This will vary with what you're trying to do, but an example is
given below.

```python
from nbrepo.models import Notebook  # Import the model for public notebooks
from nbrepo.models import Tag  # Import the model for notebook tags

tag = Tag.objects.get(label='featured')  # Search for tag by label and assign to a variable

# Search for notebook by name (you can use Notebook.objects.filter() to return a list)
nb = Notebook.objects.get(name='Census of Immune Cells: Single-Cell Workflow with CoGAPS')

nb.tags.add(tag)  # Add the tag to the notebook
nb.save()  # Save the notebook model back to the database
```