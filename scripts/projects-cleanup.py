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
parser = argparse.ArgumentParser(description='Migrate the notebook workspace to support notebook projects')
parser.add_argument('-u', '--userdir', type=str, default='/data/users/', help='Path to the users directory')
parser.add_argument('-d', '--database', type=str, default='/data/jupyterhub.sqlite', help='Path to JupyterHub database')

# Parse the arguments
args = parser.parse_args()

# ##########################################
# # Migrate user directories               #
# ##########################################
#
# # Get the list of all user directories
# user_directories = [f for f in os.listdir(args.userdir) if os.path.isdir(os.path.join(args.userdir, f))]
#
# # For each user, move the contents of their user directory to a legacy project directory
# for user_name in user_directories:
#     user_dir = os.path.join(args.userdir, user_name)
#
#     # Create the directory for the legacy project
#     legacy_path = os.path.join(user_dir, 'legacy_project')
#     os.makedirs(legacy_path, exist_ok=True)
#
#     # Move the user directory's contents to the legacy project directory
#     all_files = os.listdir(user_dir)
#     for file_name in all_files:
#         if file_name != 'legacy_project':
#             shutil.move(os.path.join(user_dir, file_name), os.path.join(legacy_path, file_name))


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
# Create named servers                   #
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
        print(f"User directory does not exist: {user_directory}")
        continue

    # Get a list of all projects belonging to the user
    cur.execute(f'SELECT name FROM spawners WHERE user_id={user_id}')
    projects = [p[0] for p in cur.fetchall() if p[0] != '']

    # Check to make sure each project directory has a matching database entry
    contents = os.listdir(user_directory)
    for p in contents:
        # Only check directories, not files
        if not os.path.isdir(os.path.join(user_directory, p)):
            continue

        # If the directory doesn't have a project in the database
        if p not in projects:
            print(f'CLEAN UP NEEDED: {encoded_username}/{p}')  # Replace this with automated delete once the script has been tested enough

# Close the connection to the database
db.close()
