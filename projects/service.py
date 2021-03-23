import json
from tornado.escape import to_basestring
from tornado.web import Application, RequestHandler, authenticated, addslash
from tornado.ioloop import IOLoop
from jupyterhub.services.auth import HubAuthenticated
from projects.hub import create_named_server, hub_db
from projects.project import Project, Tag


class PublishHandler(HubAuthenticated, RequestHandler):
    """Endpoint for publishing, editing and deleting notebook projects"""

    @addslash
    def get(self, id=None):
        """Get the list of all published projects or information about a single project"""
        if id is None:  # List all published projects
            all_projects = [p.json() for p in Project.all()]
            all_pinned = [t.label for t in Tag.all_pinned()]
            all_protected = [t.label for t in Tag.all_protected()]
            self.write({'projects': all_projects, 'pinned': all_pinned, 'protected': all_protected})
        else:           # List a single project with the specified id
            project = Project.get(id=id)
            self.write(project.json())

    @addslash
    @authenticated
    def post(self, id=None):
        """Publish a new project or copy a project"""
        if id is None: self._create()                 # Publish a new project
        else: self._copy(id)                          # Copy a public project

    def _copy(self, id):
        project = Project.get(id=id)    # Get the project
        if project is None:             # Ensure that an existing project was found
            raise Project.ExistsError
        # Check to see if the dir directory exists, if so find a good dir name
        user = self.get_current_user()['name']
        dir_name = Project.unused_dir(user, project.dir)
        # Unzip to the current user's dir directory
        project.unzip(user, dir_name)
        # Call JupyterHub API to create a new named server
        spec = project.json()
        spec['name'] += ' (copied)'
        url = create_named_server(self.hub_auth, user, dir_name, spec)
        self.write({'url': url, 'id': id, 'slug': dir_name})
        # Increment project.copied
        project.mark_copied()

    def _create(self):
        try:
            project = Project(to_basestring(self.request.body))       # Create a project from the request body
            if project.exists():                                      # If the project already exists
                old_project = Project.get(owner=project.owner, dir=project.dir)
                if old_project.deleted:                               # Check to see if it's deleted
                    self.put(old_project.id, 'Republishing project')  # If so, update it and un-delete
                    return
                else: raise Project.ExistsError                       # Otherwise, throw an error
            if not self._owner(project):                              # Ensure the correct username is set
                raise Project.PermissionError
            project.zip()                                             # Bundle the project into a zip artifact
            resp = project.save()                                     # Save the project to the database
            self.write(resp)                                          # Return the project json
        except Project.SpecError as e:                                # Bad Request
            self.send_error(400, reason=f'Error creating project, bad specification in the request: {e}')
        except Project.ExistsError:                                   # Bad Request
            self.send_error(400, reason='Error creating project, already exists')
        except Project.PermissionError:                               # Forbidden
            self.send_error(403, reason='You are not the owner of this project')

    @addslash
    @authenticated
    def delete(self, id=None):
        """Delete a project"""
        try:
            project = Project.get(id=id)        # Get the project
            if project is None:                 # Ensure that an existing project was found
                raise Project.ExistsError
            if not self._owner(project):        # Protect against deleting projects that are not your own
                raise Project.PermissionError
            project.delete_zip()                # Delete the zip bundle
            project.delete()                    # Mark the database entry as deleted
            self.write(project.json())          # Return the project json one final time
        except Project.PermissionError:         # Forbidden
            self.send_error(403, reason='You are not the owner of this project')

    @addslash
    @authenticated
    def put(self, id=None, comment=None):
        """Update a project"""
        try:
            if id is None:                      # Ensure that a project id was included in the request
                raise Project.SpecError('project id')
            project = Project.get(id=id)        # Load the project from the database
            if project is None:                 # Ensure that an existing project was found
                raise Project.ExistsError
            if not self._owner(project):        # Protect against updating projects that are not your own
                raise Project.PermissionError
            # Update the project ORM object with the contents of the request
            update_json = json.loads(to_basestring(self.request.body))
            if comment: update_json['comment'] = comment  # Override the comment if one is provided
            project.update(update_json)                   # (usually occurs if republishing a deleted project)
            # Bundle the zip, save the project and return the JSON in the response
            project.zip()                       # Bundle the project into a zip artifact
            resp = project.save()               # Save the project to the database
            self.write(resp)                    # Return the project json
        except Project.SpecError as e:          # Bad Request
            self.send_error(400, reason=f'Cannot update project. Missing required information: {e}.')
        except Project.ExistsError:             # Bad Request
            self.send_error(400, reason='Error updating project, id does not exists')
        except Project.PermissionError:         # Forbidden
            self.send_error(403, reason='You are not the owner of this project')

    def _owner(self, project):
        """Is the current user the owner of this project?"""
        return project.owner == self.get_current_user()['name']


class UserHandler(HubAuthenticated, RequestHandler):
    """Notebook projects information about the current user

       This has been engineered as a replacement for the user.json template,
       but it isn't yet fully featured, as it needs to access information that
       JupyterHub has stored in memory but not in the database"""

    @authenticated
    def get(self):
        user = self.hub_auth.get_user(self)
        username = user['name']

        # Load the user spawners and put them in the format needed for the endpoint
        spawners = hub_db.user_spawners(username)
        projects = []
        for s in spawners:
            if s[0] == '': continue  # Skip the user default spawner
            metadata = json.loads(s[2])
            projects.append({
                'slug': s[0],
                'active': s[4] is not None,
                'last_activity': s[3],
                'display_name': metadata['name'] if 'name' in metadata else s[0],
                'image': metadata['image'] if 'image' in metadata else '',
                'description': metadata['description'] if 'description' in metadata else '',
                'author': metadata['author'] if 'author' in metadata else '',
                'quality': metadata['quality'] if 'quality' in metadata else '',
                'tags': metadata['tags'] if 'tags' in metadata else '',
                'status': json.loads(s[1]),
                'name': s[0],                   # Retained for backwards compatibility with 21.02 release
                'metadata': metadata            # Retained for backwards compatibility with 21.02 release
            })

        self.write({'name': username,
                    'base_url': '',         # FIXME: Need a way to access this info
                    'images': '',           # FIXME: Need a way to access this info
                    'projects': projects})


class EndpointHandler(RequestHandler):
    """A list of all notebook project endpoints"""

    @addslash
    def get(self):
        self.write({
            '/services/projects/user.json': 'Notebook projects information about the current user',
            '/services/projects/library':   'Browse, publish or copy public notebook projects from the library',
        })


def make_app():
    urls = [
        (r"/services/projects/", EndpointHandler),
        (r"/services/projects/user.json", UserHandler),
        (r"/services/projects/library", PublishHandler),
        (r"/services/projects/library/", PublishHandler),
        (r"/services/projects/library/(?P<id>\w+)/", PublishHandler),
    ]
    return Application(urls, debug=True)


if __name__ == '__main__':
    app = make_app()
    app.listen(3000)
    IOLoop.instance().start()