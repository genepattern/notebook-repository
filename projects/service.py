import json
import os
from tornado.escape import to_basestring
from tornado.web import Application, RequestHandler, authenticated, addslash
from jupyterhub.services.auth import HubOAuthenticated, HubOAuthCallbackHandler
from .config import Config
from .emails import send_published_email, validate_token
from .errors import ExistsError, PermissionError, SpecError, InvalidProjectError, InviteError
from .hub import create_named_server, user_spawners, decode_username
from .project import Project, unused_dir
from .publish import Publish, Tag, Update
from .sharing import Share, Invite


class BaseHandler(RequestHandler):
    """A base handler that allows CORS requests"""

    def set_default_headers(self):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header('Access-Control-Allow-Methods', 'POST, PUT, GET, OPTIONS, DELETE')

    def options(self):
        self.set_status(204)
        self.finish()

    def is_admin(self):
        return self.get_current_user()['admin']

    def current_username(self):
        return decode_username(self.get_current_user()['name'])


class ProjectHandler(HubOAuthenticated, BaseHandler):
    """Endpoint for starting, stopping, editing and deleting notebook projects"""

    @addslash
    def get(self, id=None):
        """Get the project's metadata or list of projects"""
        if id is None: self._list_projects()        # List all personal projects
        else: self._project_info(id)                # List a single project with the specified id

    def _list_projects(self):
        self.send_error(501, reason='Endpoint not yet implemented')  # TODO: Implement

    def _project_info(self, id):
        self.send_error(501, reason='Endpoint not yet implemented')  # TODO: Implement

    @addslash
    def post(self, id=None):
        """Start or create a project"""
        if id is None: self._create_project()       # Create a new project
        else: self._start_project(id)               # Start the specified project

    def _create_project(self):
        self.send_error(501, reason='Endpoint not yet implemented')  # TODO: Implement

    def _start_project(self, id):
        self.send_error(501, reason='Endpoint not yet implemented')  # TODO: Implement

    @addslash
    def put(self, id=None, directive=None):
        """Edit or duplicate the project"""
        if not id:                      # No id, return error
            self.send_error(400, reason='Project id not specified')
        elif not directive:             # By default, edit a project
            self._edit_project(id)
        elif directive == 'duplicate':  # Duplicate the specified project
            self._duplicate_project(id)
        else:                           # Directive not recognized
            self.send_error(400, reason='Unknown directive')

    def _edit_project(self, id):
        self.send_error(501, reason='Endpoint not yet implemented')  # TODO: Implement

    def _duplicate_project(self, dir):  # TODO: Use id after refactor
        user = self.current_username()
        project = Project.get(owner=user, dir=dir)  # Get the project
        if project is None:             # Ensure that an existing project was found
            raise ExistsError
        # Check to see if the dir directory exists, if so find a good dir name
        dir_name, count = unused_dir(user, project.dir)
        # Copy the project directory
        project.duplicate(dir_name)
        # Call JupyterHub API to create a new named server
        spec = project.json()
        if count: spec['name'] += f' (copy {count})'
        url = create_named_server(self.hub_auth, user, dir_name, spec)
        self.write({'url': url, 'dir': dir, 'slug': dir_name})

    @addslash
    def delete(self, id=None, directive=None):
        """Stop or delete the project"""
        if not id:                      # No id, return error
            self.send_error(400, reason='Project id not specified')
        elif not directive:             # By default, stop a project
            self._stop_project(id)
        elif directive == 'delete':     # delete the specified project
            self._delete_project(id)
        else:                           # Directive not recognized
            self.send_error(400, reason='Unknown directive')

    def _stop_project(self, id):
        self.send_error(501, reason='Endpoint not yet implemented')  # TODO: Implement

    def _delete_project(self, id):
        self.send_error(501, reason='Endpoint not yet implemented')  # TODO: Implement


class PublishHandler(HubOAuthenticated, BaseHandler):
    """Endpoint for publishing, editing and deleting published projects"""

    @addslash
    def get(self, id=None, directive=None):
        """Get the list of all published projects or information about a single project"""
        if id is None:                      # List all published projects
            self._list_projects()
        elif directive is None:             # List a single project with the specified id
            self._project_info(id)
        elif directive == 'download':       # Return a download response for the zip
            self._download_project(id)
        elif directive == 'copy':           # Copy the project and redirect to it
            self._copy_and_redirect(id)
        else:                               # Directive not recognized
            self.send_error(400, reason='Unknown directive')

    def _list_projects(self):
        all_projects = [p.json() for p in Publish.all()]
        all_pinned = [t.label for t in Tag.all_pinned()]
        all_protected = [t.label for t in Tag.all_protected()]
        self.write({'projects': all_projects, 'pinned': all_pinned, 'protected': all_protected})

    def _project_info(self, id):
        project = Publish.get(id=id)
        include_files = self.get_argument("files", None, True)
        self.write(project.json(include_files=include_files))

    def _download_project(self, id):
        project = Publish.get(id=id)
        buf_size = 4096
        self.set_header('Content-Type', 'application/zip, application/octet-stream')
        self.set_header('Content-Disposition', f'attachment; filename={project.dir}.zip')
        with open(project.zip_path(), 'rb') as f:
            while True:
                data = f.read(buf_size)
                if not data:
                    break
                self.write(data)
        self.finish()

    def _copy_and_redirect(self, id):
        self._copy(id, redirect=True)

    @addslash
    @authenticated
    def post(self, id=None):
        """Publish a new project or copy a project"""
        if id is None: self._create()                 # Publish a new project
        else: self._copy(id)                          # Copy a public project

    def _copy(self, id, redirect=False):
        project = Publish.get(id=id)    # Get the project
        if project is None:             # Ensure that an existing project was found
            raise ExistsError
        # Check to see if the dir directory exists, if so find a good dir name
        user = self.current_username()
        dir_name, count = unused_dir(user, project.dir)
        # Unzip to the current user's dir directory
        project.unzip(user, dir_name)
        # Call JupyterHub API to create a new named server
        spec = project.json()
        if count: spec['name'] += f' (copy {count})'
        url = create_named_server(self.hub_auth, user, dir_name, spec)
        self.write({'url': url, 'id': id, 'slug': dir_name})
        # Increment project.copied
        project.mark_copied()
        # Redirect, if requested
        if redirect: self.redirect(url)

    def _create(self):
        try:
            project = Publish(to_basestring(self.request.body))       # Create a project from the request body
            if project.exists():                                      # If the project already exists
                old_project = Publish.get(owner=project.owner, dir=project.dir)
                if old_project.deleted:                               # Check to see if it's deleted
                    self.put(old_project.id, 'Republishing project')  # If so, update it and un-delete
                    send_published_email(self._host_url(), project.id, project.name)  # Send a notification email
                    return
                else: raise ExistsError                               # Otherwise, throw an error
            if not self._owner(project):                              # Ensure the correct username is set
                raise PermissionError
            project.zip()                                             # Bundle the project into a zip artifact
            resp = project.save()                                     # Save the project to the database
            send_published_email(self._host_url(), project.id, project.name)  # Send a notification email
            self.write(resp)                                          # Return the project json
        except SpecError as e:                                        # Bad Request
            self.send_error(400, reason=f'Error creating project: {e}')
        except ExistsError:                                           # Bad Request
            self.send_error(400, reason='Error creating project, already exists')
        except PermissionError:                                       # Forbidden
            self.send_error(403, reason='You are not the owner of this project')

    def _host_url(self):
        return f'{self.request.protocol}://{self.request.host}'

    @addslash
    @authenticated
    def delete(self, id=None):
        """Delete a project"""
        try:
            project = Publish.get(id=id)        # Get the project
            if project is None:                 # Ensure that an existing project was found
                raise ExistsError
            if not self._owner(project) and not self.is_admin():
                raise PermissionError           # Protect against deleting projects that are not your own
            project.delete_zip()                # Delete the zip bundle
            project.delete()                    # Mark the database entry as deleted
            self.write(project.json())          # Return the project json one final time
        except PermissionError:                 # Forbidden
            self.send_error(403, reason='You are not the owner of this project')

    @addslash
    @authenticated
    def put(self, id=None, comment=None):
        """Update a project"""
        try:
            if id is None:                      # Ensure that a project id was included in the request
                raise SpecError('project id')
            project = Publish.get(id=id)        # Load the project from the database
            if project is None:                 # Ensure that an existing project was found
                raise ExistsError
            if not self._owner(project) and not self.is_admin():
                raise PermissionError           # Protect against updating projects that are not your own
            # Update the project ORM object with the contents of the request
            update_json = json.loads(to_basestring(self.request.body))
            if comment: update_json['comment'] = comment  # Override the comment if one is provided
            project.update(update_json)                   # (usually occurs if republishing a deleted project)
            # Bundle the zip, save the project and return the JSON in the response
            if self._owner(project):            # Skip updating the project zip if only an admin editing metadata
                project.zip()                   # Bundle the project into a zip artifact
            resp = project.save()               # Save the project to the database
            self.write(resp)                    # Return the project json
        except SpecError as e:                  # Bad Request
            self.send_error(400, reason=f'Cannot update project. Missing required information: {e}.')
        except ExistsError:                     # Bad Request
            self.send_error(400, reason='Error updating project, id does not exists')
        except PermissionError:                 # Forbidden
            self.send_error(403, reason='You are not the owner of this project')

    def _owner(self, project):
        """Is the current user the owner of this project?"""
        return project.owner == self.current_username()


class ShareHandler(HubOAuthenticated, BaseHandler):
    """Endpoint for sharing and accepting notebook projects"""

    @addslash
    @authenticated
    def get(self, id=None):
        """Get the list of projects you are sharing or which are shared with you"""
        if self._invite(): self._accept(id, redirect=True)  # Accepting invite with emailed link
        elif id is None: self._list_shared()    # List your shared projects
        else: self._sharing_info(id)            # List a shared project with the specified id

    @addslash
    @authenticated
    def post(self, id=None):
        """Share a new project or accept a sharing invite"""
        if id is None: self._create_share()     # Share a new project
        elif self._invite(): self._accept(id)   # Accept sharing
        else: self._share_only()                # Return error

    @addslash
    @authenticated
    def delete(self, id=None):
        """Stop sharing or reject sharing invite"""
        if self._invite(): self._reject(id)     # Reject sharing
        else: self._remove(id)                  # Unshare a project

    @addslash
    @authenticated
    def put(self, id=None):
        """Update sharing collaborators"""
        if self._invite(): self._share_only()   # Return error is accessed with /invite/ url
        self._update(id)

    def _invite(self):
        return '/invite/' in self.request.uri

    def _share_only(self):
        self.send_error(400, reason=f'Endpoint only valid with share id')

    def _list_shared(self):
        shared_by_me = [p.json() for p in Share.shared_by_me(self.current_username())]
        shared_with_me = [p.json() for p in Share.shared_with_me(self.current_username())]
        self.write({'shared_by_me': shared_by_me, 'shared_with_me': shared_with_me})

    def _sharing_info(self, id=None):
        try:
            share = Share.get(id=id)
            if share is None:                                       # Ensure that the share exists
                raise ExistsError
            if not self._is_current_user(share.owner):              # Ensure the correct username is set
                raise PermissionError
            self.write(share.json())
        except ExistsError:                                         # Bad Request
            self.send_error(400, reason='Unable to get sharing info, share id not found')
        except PermissionError:                                     # Forbidden
            self.send_error(403, reason='You are not the owner of this project')

    def _create_share(self):
        """Share a project with other users"""
        try:
            share = Share(to_basestring(self.request.body))         # Create a share from the request body
            self._validate_and_save(share, new_users=True)          # Validate and save the share
        except SpecError as e:                                      # Bad Request
            self.send_error(400, reason=f'Error creating share: {e}')

    def _validate_and_save(self, share, new_share=True, new_users=None):
        """Share a project with other users"""
        try:
            if not self._is_current_user(share.owner):              # Ensure the correct username is set
                raise PermissionError
            if new_share and share.exists():                        # If already shared
                raise ExistsError                                   # Throw an error
            if not share.dir_exists():                              # Ensure the project directory exists
                raise InvalidProjectError                           # If not, throw an error
            share.validate_invites()                                # Validate the invitees
            resp = share.save()                                     # Save the share to the database
            share.notify(self._host_url(), new_users)               # Notify the invitees
            self.write(resp)                                        # Return the share json
        except ExistsError:                                         # Bad Request
            self.send_error(400, reason='Error creating share, already shared')
        except InvalidProjectError:                                 # Bad Request
            self.send_error(400, reason='Shared project directory not found')
        except InviteError as e:                                    # Bad Request
            self.send_error(400, reason=f'Invalid user: {e}')
        except PermissionError:                                     # Forbidden
            self.send_error(403, reason='You are not the owner of this project')

    def _host_url(self):
        return f'{self.request.protocol}://{self.request.host}'

    def _is_current_user(self, user):
        """Is the current user the owner of this share?"""
        return user == self.current_username()

    def _set_invite_user(self, invite):
        """Associate the invite with the current user"""
        invite.user = self.current_username()

    def _validate_token(self, invite):
        """Validate the provided hash for the invite"""
        token = self.get_argument('token', None, True)              # Get the provided token
        if token is None: return False                              # Return false if no token provided
        return validate_token(token, invite.id, invite.user)        # Validate the token

    def _accept(self, id, redirect=False):
        """Accept a sharing invite that you have been sent"""
        try:
            invite = Invite.get(id=id)
            if invite is None:                                      # Ensure that an existing invite was found
                raise ExistsError
            if not self._is_current_user(invite.user):              # Make sure you are the invitee
                if self._validate_token(invite):                    # If not, is a valid email hash provided?
                    self._set_invite_user(invite)                   # Associate the invite with the user
                else: raise PermissionError
            invite.accepted = True                                  # Remove the invite
            resp = invite.save()                                    # Save changes
            if redirect: self.redirect('/hub/')                     # Redirect to the project
            else: self.write(resp)                                  # Return the invite json

        except ExistsError:                                         # Bad Request
            self.send_error(400, reason='Unable to accept share, invite id not found')
        except PermissionError:                                     # Forbidden
            self.send_error(403, reason='You cannot accept an invite that is not yours')

    def _remove(self, id=None):
        """Unshare a project"""
        try:
            share = Share.get(id=id)                                # Get the share
            if share is None:                                       # Ensure that an existing share was found
                raise ExistsError
            if not self._is_current_user(share.owner):              # Make sure you are the owner
                raise PermissionError
            share.delete()                                          # Mark the database entry as deleted
            self.write(share.json())                                # Return the share json one final time
        except ExistsError:                                         # Bad Request
            self.send_error(400, reason='Unable to remove share, share id not found')
        except PermissionError:                                     # Forbidden
            self.send_error(403, reason='You are not the owner of this project')

    def _reject(self, id=None):
        """Reject a sharing invite that you have been sent"""
        try:
            invite = Invite.get(id=id)
            if invite is None:  # Ensure that an existing invite was found
                raise ExistsError
            if not self._is_current_user(invite.user):  # Make sure you are the invitee
                raise PermissionError
            share = Share.get(id=invite.share_id)
            if len(share.invites) == 1:                 # If this is the last invite
                share.delete()                          # Delete the share entirely
            else: invite.delete()                       # Otherwise, delete only the invite
            self.write(invite.json())                   # Return the invite json
        except ExistsError:  # Bad Request
            self.send_error(400, reason='Unable to reject share, invite id not found')
        except PermissionError:  # Forbidden
            self.send_error(403, reason='You cannot reject an invite that is not yours')

    def _update(self, id=None):
        """Edit the project's sharing"""
        try:
            share = Share.get(id=id)                                                # Get the share
            if share is None:                                                       # Ensure that the share exists
                raise ExistsError
            # Update list of invitees
            new_users, removed_users, continuing_users = share.update_invites(to_basestring(self.request.body))
            # Validate and save the share
            self._validate_and_save(share, new_share=False, new_users=new_users)
            for i in removed_users: Invite.remove(i)                                # Remove old Invite DB entries
            if len(new_users) == 0 and len(continuing_users) == 0:                  # Remove share if no invites left
                share.delete()
        except SpecError as e:                                                      # Bad Request
            self.send_error(400, reason=f'Error updating share: {e}')
        except ExistsError:                                                         # Bad Request
            self.send_error(400, reason='Unable to updating share, share id not found')


class UserHandler(HubOAuthenticated, BaseHandler):
    """Notebook projects information about the current user
       This has been engineered as a replacement for the user.json template"""

    @authenticated
    def get(self):
        user = self.get_current_user()
        username = user['name']

        # Load the user spawners and put them in the format needed for the endpoint
        spawners = user_spawners(username)
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
                'citation': metadata['citation'] if 'citation' in metadata else '',
                'tags': metadata['tags'] if 'tags' in metadata else '',
                'status': json.loads(s[1]),
                'name': s[0],                   # Retained for backwards compatibility with 21.02 release
                'metadata': metadata            # Retained for backwards compatibility with 21.02 release
            })

        self.write({'name': username,
                    'base_url': self.hub_auth.hub_prefix,
                    'admin': user['admin'],
                    'images': os.getenv('IMAGE_WHITELIST').split(','),
                    'projects': projects})


class StatsHandler(HubOAuthenticated, BaseHandler):
    """Endpoint for reporting notebook workspace usage stats and related information"""

    @addslash
    def get(self):
        all_updates = [p.json() for p in Update.all()][:1000]
        copied_projects = [p.json() for p in Publish.all(sort_by_copied=True)][:100]

        self.write({'updates': all_updates,
                    'usage': copied_projects})


class EndpointHandler(BaseHandler):
    """A list of all notebook project endpoints"""

    @addslash
    def get(self):
        self.write({
            '/services/projects/user.json': 'Notebook projects information about the current user',
            '/services/projects/library':   'Browse, publish or copy public notebook projects from the library',
            '/services/projects/sharing':   'Share projects with other users',
        })


def make_app(config_path):
    # Init the config from the config file and load the database
    Config.load_config(config_path)

    # Assign handlers to the URLs and return
    urls = [
        (r"/services/projects/", EndpointHandler),
        (r"/services/projects/user.json", UserHandler),
        (r"/services/projects/oauth_callback", HubOAuthCallbackHandler),

        (r"/services/projects/project", ProjectHandler),
        (r"/services/projects/project/", ProjectHandler),
        (r"/services/projects/project/(?P<id>\w+)/", ProjectHandler),
        (r"/services/projects/project/(?P<id>\w+)/(?P<directive>\w+)/", ProjectHandler),

        (r"/services/projects/library", PublishHandler),
        (r"/services/projects/library/", PublishHandler),
        (r"/services/projects/library/(?P<id>\w+)/", PublishHandler),
        (r"/services/projects/library/(?P<id>\w+)/(?P<directive>\w+)/", PublishHandler),

        (r"/services/projects/sharing", ShareHandler),
        (r"/services/projects/sharing/", ShareHandler),
        (r"/services/projects/sharing/(?P<id>\w+)/", ShareHandler),
        (r"/services/projects/sharing/invite/(?P<id>\w+)/", ShareHandler),

        (r"/services/projects/stats/", StatsHandler),
    ]
    return Application(urls, cookie_secret=os.urandom(32), debug=True)
