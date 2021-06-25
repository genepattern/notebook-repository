from tornado.web import Application, addslash, RequestHandler
from tornado.ioloop import IOLoop
import logging


class RedirectHandler(RequestHandler):
    """Redirect the old preview URL to the new one"""

    @addslash
    def get(self, id=None):
        self.redirect(f'/hub/preview?id={id}')  # Redirect to the new preview page


def make_app():
    # Assign handlers to the URLs and return
    urls = [
        (r"/services/sharing/notebooks/(?P<id>\w+)/preview/", RedirectHandler),
    ]
    return Application(urls, debug=True)


if __name__ == '__main__':
    logging.info(f'Redirect Service started on 3001')

    app = make_app()
    app.listen(3001)
    IOLoop.instance().start()