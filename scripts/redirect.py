#!/usr/bin/env python

import re
import tornado.httpserver
from tornado import web


class MainHandler(web.RequestHandler):
    def prepare(self):
        if self.request.protocol == "http":
            redirect_to = re.sub(r'^([^:]+)', 'https', self.request.full_url())
            self.redirect(redirect_to, permanent=True)

    def get(self):
        self.write("Redirecting to HTTPS...")

application = web.Application([
    (r'/.*', MainHandler),
])

http_server = tornado.httpserver.HTTPServer(application)

if __name__ == '__main__':
    http_server.listen(8080)
    tornado.ioloop.IOLoop.instance().start()
