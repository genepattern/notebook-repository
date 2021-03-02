#!/usr/bin/env python3.6

import sqlite3
import argparse
import urllib.parse
import os
import shutil

##########################################
# Parse the command line arguments       #
##########################################

# Handle the userdir and database arguments
parser = argparse.ArgumentParser(description='Cleanup old project directories the notebook workspace')
parser.add_argument('-u', '--userdir', type=str, default='/data/users/', help='Path to the users directory')
parser.add_argument('-d', '--database', type=str, default='/data/jupyterhub.sqlite', help='Path to JupyterHub database')

# Parse the arguments
args = parser.parse_args()


def normalize_username(username):
    """Normalize the given username to lowercase and to remove special characters

       Overrides Authenticator.normalize_username()"""
    return urllib.parse.quote(username.lower(), safe='') \
        .replace('.', '%2e') \
        .replace('-', '%2d') \
        .replace('~', '%7e') \
        .replace('_', '%5f') \
        .replace('%', '-')


##########################################
# Iterate through user directories       #
##########################################

# Get a connection to the database
db = None
try:
    db = sqlite3.connect(args.database)
except sqlite3.Error as e:
    print(e)

# Get a list of all users
cur = db.cursor()
cur.execute('SELECT * FROM users')
users = cur.fetchall()

# Compare projects with file system for all users
for user in users:
    # Get the user_id, username and relevant paths
    user_id = user[0]
    encoded_username = normalize_username(user[1])
    user_directory = os.path.join(args.userdir, encoded_username)

    # Check to make sure that the user directory exists
    if not os.path.exists(user_directory):
        # print(f"User directory does not exist: {user_directory}")
        continue

    # Get a list of all projects belonging to the user
    cur.execute(f'SELECT name FROM spawners WHERE user_id={user_id}')
    projects = [p[0] for p in cur.fetchall() if p[0] != '']

    # Check to make sure each project directory has a matching database entry
    contents = os.listdir(user_directory)
    for p in contents:
        # Only check directories, not files
        project_path = os.path.join(user_directory, p)
        if not os.path.isdir(project_path):
            continue

        # If the directory doesn't have a project in the database
        if p not in projects:
            print(f'REMOVING {project_path}')
            shutil.rmtree(project_path)

# Close the connection to the database
db.close()
