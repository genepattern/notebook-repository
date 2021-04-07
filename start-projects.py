#!/usr/bin/env python3

import argparse
from projects import make_app
from tornado.ioloop import IOLoop


# Get the arguments passed into the script
parser = argparse.ArgumentParser(description='Start the project publishing and sharing service')
parser.add_argument('-d', '--database', type=str, default='/data/projects.sqlite', help='Path to the projects database')
parser.add_argument('-u', '--userdir', type=str, default='/data/users/', help='Path to the users directory')
parser.add_argument('-r', '--repository', type=str, default='/data/repository/', help='Path to the repo directory')
parser.add_argument('-j', '--hubdb', type=str, default='/data/jupyterhub.sqlite', help='Path to the JupyterHub db')
parser.add_argument('-p', '--port', type=int, default=3000, help='Port to run the service on')
args = parser.parse_args()


if __name__ == '__main__':
    app = make_app(db_path=args.database, user_dir=args.userdir, repo_dir=args.repository, hub_db=args.hubdb)
    app.listen(args.port)
    IOLoop.instance().start()
