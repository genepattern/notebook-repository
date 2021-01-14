#!/usr/bin/env python3.6

import sqlite3
import argparse
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

##########################################
# Migrate user directories               #
##########################################

# Get the list of all user directories
user_directories = [f for f in os.listdir(args.userdir) if os.path.isdir(os.path.join(args.userdir, f))]

# For each user, move the contents of their user directory to a legacy project directory
for user_name in user_directories:
    user_dir = os.path.join(args.userdir, user_name)

    # Create the directory for the legacy project
    legacy_path = os.path.join(user_dir, 'legacy_project')
    os.makedirs(legacy_path, exist_ok=True)

    # Move the user directory's contents to the legacy project directory
    all_files = os.listdir(user_dir)
    for file_name in all_files:
        if file_name != 'legacy_project':
            shutil.move(os.path.join(user_dir, file_name), os.path.join(legacy_path, file_name))

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

# Insert a new spawner for each user's legacy project
for user in users:
    # Get the username for this user
    user_id = user[0]
    username = user[1]

    # Insert a new project into the servers table
    user_options = '{"image": "Legacy", "name": "Legacy Notebook Workspace", "description": "Click here to access your previous notebooks."}'
    sql = 'INSERT INTO spawners(user_id, server_id, state, name, started, last_activity, user_options) ' + \
          f"VALUES({user_id}, null, null, 'legacy_project', null, null, '{user_options}')"
    cur.execute(sql)
    db.commit()
    print(cur.lastrowid)

# Close the connection to the database
db.close()

