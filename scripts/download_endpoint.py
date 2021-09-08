from tornado.web import Application, RequestHandler
from tornado.ioloop import IOLoop
from jupyterhub.services.auth import HubAuth
import logging
import os


class DownloadHandler(RequestHandler):
    """Download file endpoint for the GenePattern server"""

    USERS_PATH = '/data/users'

    def get(self, token=None, path=None):
        # Get API key from the environment or return an error
        try: api_token = os.environ['JUPYTERHUB_API_TOKEN']
        except KeyError:
            self.send_error(500, reason='API key not found in environment')
            return

        # Initialize a JupyterHub auth singleton, verify the incoming token and the user's admin privileges
        auth = HubAuth(api_token=api_token, cache_max_age=60)
        user = auth.user_for_token(token)  # Get the user, None if cannot be authenticated
        if user is None or not user['admin']:
            self.send_error(403, reason='Token authentication or privilege check failed')
            return

        # Read the path, ensure that the requested file exists and is not a directory
        file_path = DownloadHandler._url_to_file_path(path)
        if not file_path or not os.path.exists(file_path) or os.path.isdir(file_path):
            self.send_error(404, reason='Requested file not found')
            return

        # Serve the file download
        buf_size = 4096
        file_name = os.path.basename(file_path)
        self.set_header('Content-Type', 'application/octet-stream')
        self.set_header('Content-Disposition', f'attachment; filename={file_name}')
        with open(file_path, 'rb') as f:
            while True:
                data = f.read(buf_size)
                if not data:
                    break
                self.write(data)
        self.finish()

    @staticmethod
    def _url_to_file_path(url_path):
        # Break the api path up into its constituent components, ex: user/bob/project-name/edit/BRCA_HUGO_symbols.gct
        [ user_directive, user, project, app_directive, relative_path ] = url_path.split('/', 4)
        # Expected path sanity checks
        if user_directive != 'user' or len(user) == 0 or len(project) == 0 or len(relative_path) == 0: return None
        # Construct the path and return
        return os.path.join(DownloadHandler.USERS_PATH, user, project, relative_path)


def make_app():
    # Assign handlers to the URLs and return
    urls = [
        (r"/services/download/(?P<token>\w+)/(?P<path>.*)", DownloadHandler),
    ]
    return Application(urls, debug=True)


if __name__ == '__main__':
    logging.info(f'Download Service started on 3002')

    app = make_app()
    app.listen(3002)
    IOLoop.instance().start()