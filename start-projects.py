#!/usr/bin/env python3

import argparse
import logging
from projects import make_app
from tornado.ioloop import IOLoop
from tornado.log import enable_pretty_logging


# Enable logging
logger = logging.getLogger(__name__)
enable_pretty_logging()


# Get the arguments passed into the script
parser = argparse.ArgumentParser(description='Start the project publishing and sharing service')
parser.add_argument('-c', '--config', type=str, default='/data/projects_config.py', help='Path to the projects config')
parser.add_argument('-p', '--port', type=int, default=3000, help='Port to run the service on')
args = parser.parse_args()


if __name__ == '__main__':
    logging.info(f'Projects Service started on {args.port}: {args.config}')

    app = make_app(config_path=args.config)
    app.listen(args.port)
    IOLoop.instance().start()
