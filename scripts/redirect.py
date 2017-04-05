#!/usr/bin/env python

import http.server
import socketserver

the_port = 8080
the_redirect_url = 'https://awsnotebook.genepattern.org'

class myHandler(http.server.SimpleHTTPRequestHandler):
   def do_GET(self):
       print (self.path)
       self.send_response(301)
       new_path = '%s%s'%(the_redirect_url, self.path)
       self.send_header('Location', new_path)
       self.end_headers()


handler = socketserver.TCPServer(("", the_port), myHandler)
print ("serving rediect to  ", the_redirect_url,  " at port ", the_port)

try:
    handler.serve_forever()
except KeyboardInterrupt:
    print("Shutting down...")
    handler.shutdown()