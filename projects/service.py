import json
from tornado.escape import to_basestring
from tornado.web import Application, RequestHandler, authenticated, addslash
from tornado.ioloop import IOLoop
from jupyterhub.services.auth import HubAuthenticated
from projects.hub import hub_db
from projects.project import Project

# base_api_url = self.hub_auth.api_url
# token = self.hub_auth.api_token
# r = requests.get(base_api_url + '/users/tabor', headers={
#         'Authorization': 'token %s' % token,
#     })


class PublishHandler(HubAuthenticated, RequestHandler):
    """Endpoint for publishing, editing and deleting notebook projects"""

    @addslash
    def get(self, id=None):
        """Get the list of all published projects or information about a single project"""
        if id is None:  # List all published projects
            pass
        else:           # List a single project with the specified id
            pass

    @addslash
    @authenticated
    def post(self, id=None):
        """Publish a new project or copy a project"""
        if id is None:                                # Publish a new project
            try:
                project = Project(to_basestring(self.request.body))  # Create a project from the request body
                if project.exists():                  # If the project already exists, throw an exception
                    raise Project.ExistsError
                project.zip()                         # Bundle the project into a zip artifact
                resp = project.save()                 # Save the project to the database
                self.write(resp)                      # Return the project json
            except Project.SpecError as e:            # Bad Request
                self.send_error(400, reason=f'Error creating project, bad specification in the request: {e}')
            except Project.ExistsError:               # Bad Request
                self.send_error(400, reason='Error creating project, already exists')

        else:                                         # Copy a public project
            pass  # TODO: Implement

    @addslash
    @authenticated
    def delete(self, id=None):
        """Delete a project"""
        pass

    @addslash
    @authenticated
    def put(self, id=None):
        """Update a project"""
        pass


class UserHandler(HubAuthenticated, RequestHandler):
    """Notebook projects information about the current user"""

    @authenticated
    def get(self):
        user = self.hub_auth.get_user(self)
        username = user['name']

        # Load the user spawners and put them in the format needed for the endpoint
        spawners = hub_db.user_spawners(username)
        projects = []
        for s in spawners:
            if s[0] == '': continue  # Skip the user default spawner
            projects.append({
                'name': s[0],
                'status': json.loads(s[1]),
                'metadata': json.loads(s[2])
            })

        self.write({'name': username, 'projects': projects})


class EndpointHandler(RequestHandler):
    """A list of all notebook project endpoints"""

    @addslash
    def get(self):
        self.write({
            'user.json': 'Notebook projects information about the current user',
            'library':   'Browse, publish or copy public notebook projects from the library',
        })


def make_app():
    urls = [
        (r"/services/projects/", EndpointHandler),
        (r"/services/projects/user.json", UserHandler),
        (r"/services/projects/library/", PublishHandler),
        (r"/services/projects/library/(?P<id>\w+)/", PublishHandler),
    ]
    return Application(urls, debug=True)


if __name__ == '__main__':
    app = make_app()
    app.listen(3000)
    IOLoop.instance().start()