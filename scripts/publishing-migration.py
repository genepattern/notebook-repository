#!/usr/bin/env python3.6

import sqlite3
import argparse
import os
import shutil
import json
from urllib.parse import unquote
import requests
from projects import Project, Share, Config, Tag
from datetime import datetime

##########################################
# Parse the command line arguments       #
##########################################

# Handle the repodump and database arguments
parser = argparse.ArgumentParser(description='Migrate the workspace to support project publishing')
parser.add_argument('-r', '--repodump', type=str, default='/data/repo.json', help='Path to the repository dump json')
parser.add_argument('-t', '--sharedump', type=str, default='/data/share.json', help='Path to the share dump json')
parser.add_argument('-y', '--statsdump', type=str, default='/data/stats.json', help='Path to the shats dump json')
parser.add_argument('-s', '--server', type=str, default='https://notebook.genepattern.org', help='URL to the server')
parser.add_argument('-d', '--hubdb', type=str, default='/data/jupyterhub.sqlite', help='Path to JupyterHub database')
parser.add_argument('-u', '--userdir', type=str, default='/data/users/', help='Path to the users directory')

# Parse the arguments
args = parser.parse_args()

##########################################
# Utility functions                      #
##########################################


def is_workshop_nb(tags_obj):
    return 'workshop' in [t['label'] for t in tags_obj]


def tags_str(tags_obj):
    return ",".join([t['label'] for t in tags_obj])


def find_user(users_list, username):
    for u in users_list:
        if username == u[1]:
            return u[0]


def decode_username(jh_username):
    return unquote(jh_username.replace('-', '%'))


def sharing_api_to_username(sharing_path):
    return sharing_path.split("/")[0]


def generate_invites(shared_with):
    to_return = []
    for i in shared_with:
        if not i["owner"]:
            to_return.append(decode_username(i["user"]) if len(i["user"]) else i["email"])
    return json.dumps(to_return)


def escape_quotes(raw_str):
    return raw_str.replace("'", "")


##########################################
# Create the repo JSON dump or load it   #
##########################################

if not os.path.exists(args.repodump):
    print('Generating repo.json')
    url = args.server + '/services/sharing/notebooks/'
    r = requests.get(url)
    with open(args.repodump, 'wb') as f:
        f.write(r.content)

print('Loading repo.json')
with open(args.repodump) as f:
    old_repo = json.load(f)

##########################################
# Create the stats JSON dump or load it   #
##########################################

if not os.path.exists(args.statsdump):
    print('Generating stats.json')
    url = args.server + '/services/sharing/notebooks/stats/'
    r = requests.get(url)
    with open(args.statsdump, 'wb') as f:
        f.write(r.content)

print('Loading stats.json')
with open(args.statsdump) as f:
    old_stats = json.load(f)

##########################################
# Create the share JSON dump or load it  #
##########################################

if not os.path.exists(args.sharedump):
    print('Generating share.json')
    url = args.server + '/services/sharing/sharing/'
    r = requests.get(url)
    with open(args.sharedump, 'wb') as f:
        f.write(r.content)

    # Read the file
    with open(args.sharedump) as f:
        old_shares = json.load(f)

    # Replace share_with property with expanded view
    for nb in old_shares['results']:
        new_shared_with = []
        for url in nb["shared_with"]:
            r = requests.get(url)
            new_shared_with.append(json.loads(r.content))
        nb["shared_with"] = new_shared_with

    with open(args.sharedump, 'w') as f:
        f.write(json.dumps(old_shares))

print('Loading share.json')
with open(args.sharedump) as f:
    old_shares = json.load(f)

##########################################
# Get list of users                      #
##########################################

# Get a connection to the database
print('Getting user list')
db = None
try:
    db = sqlite3.connect(args.hubdb)
except sqlite3.Error as e:
    print(e)

# Get a list of all users
cur = db.cursor()
cur.execute('SELECT * FROM users')
users = cur.fetchall()

##########################################
# Create a project from each notebook    #
##########################################

# Insert a new spawner for each user's shared project
print('Creating notebook projects')
for nb in old_repo['results']:

    # If this is a workshop notebook, skip
    if is_workshop_nb(nb["tags"]):
        print('Workshop notebook found, skipping')
        continue

    if not os.path.exists(nb['file_path']):
        print('Cannot find repo file, skipping: ' + nb['file_path'])
        continue

    # Get the username for this user
    print(f'Setting up {nb["name"]}')
    user_id = find_user(users, nb['owner'])
    slug = f'notebook_{nb["id"]}'
    gp_username = decode_username(nb['owner'])
    copied = old_stats[nb["name"]]["copied"]
    print(f'--id: {user_id}, slug: {slug}, user: {gp_username}, copied: {copied}')

    if user_id is None:
        print(f'--User {nb["owner"]} not found, assigning to admin {nb["name"]}')
        user_id = 1

    # Insert a new project into the servers table
    user_options = f'{{ "image": "Legacy", "name": "{nb["name"]}", "description": "{nb["description"]}", ' + \
                   f'"author": "{nb["author"]}", "quality": "{nb["quality"]}", "tags": "{tags_str(nb["tags"])}", ' + \
                   f'"dir": "{slug}", "owner": "{gp_username}", "copied": {copied} }}'
    user_options = escape_quotes(user_options)
    sql = 'INSERT INTO spawners(user_id, server_id, state, name, started, last_activity, user_options) ' + \
          f"VALUES({user_id}, null, '{{}}', '{slug}', null, null, '{user_options}')"
    cur.execute(sql)
    db.commit()
    print('--DB row inserted for ' + gp_username)

    # Create the project directory
    user_dir = os.path.join(args.userdir, nb['owner'])
    project_dir = os.path.join(user_dir, slug)
    os.makedirs(project_dir, exist_ok=True)
    shutil.copy(nb['file_path'], project_dir)

##########################################
# Publish each notebook project          #
##########################################

    try:
        print('--Publishing project')
        config = Config.load_config('/data/projects_config.py')
        project = Project(user_options)  # Create a project from the request body
        project.created = datetime.strptime(nb["publication"], '%Y-%m-%d')
        project.id = nb["id"]
        project.zip()  # Bundle the project into a zip artifact
        resp = project.save()  # Save the project to the database
    except Exception as e:
        print(f'--Error publishing project: {e}')

##########################################
# Pin and protect specific tags          #
##########################################

featured = Tag.get(label='featured')
featured.pinned = True
featured.protected = True
featured.save()

tutorial = Tag.get(label='tutorial')
tutorial.pinned = True
tutorial.protected = True
tutorial.save()

community = Tag.get(label='community')
community.pinned = True
community.save()

workshop = Tag.get(label='workshop')
if workshop is None: workshop = Tag('workshop')
workshop.pinned = True
workshop.protected = True
workshop.save()

print('Done migrating publishing')

##########################################
# Create a project from each share       #
##########################################

# Insert a new spawner for each user's shared project
print('Creating notebook shares')
for nb in old_shares['results']:
    print(f'Setting up {nb["name"]}')

    # Skip if this is shared with no invitees
    if len(nb["shared_with"]) == 1:
        print("--Share with no invitees found, skipping")
        continue

    # Get the username for this user
    encoded_user = sharing_api_to_username(nb['api_path'])
    user_id = find_user(users, encoded_user)
    slug = f'share_{nb["id"]}'
    gp_username = decode_username(encoded_user)
    print(f'--id: {user_id}, slug: {slug}, user: {gp_username}')

    if user_id is None:
        print(f'--User for {nb["api_path"]} not found, skipping share')
        continue

    # Insert a new project into the servers table
    user_options = f'{{ "image": "Legacy", "name": "{nb["name"]}", "description": "This shared notebook was migrated to the new project sharing functionality."}}'
    sql = 'INSERT INTO spawners(user_id, server_id, state, name, started, last_activity, user_options) ' + \
          f"VALUES({user_id}, null, '{{}}', '{slug}', null, null, '{user_options}')"
    cur.execute(sql)
    db.commit()
    print('--DB row inserted for ' + encoded_user)

    # Create the project directory
    user_dir = os.path.join(args.userdir, encoded_user)
    project_dir = os.path.join(user_dir, slug)
    os.makedirs(project_dir, exist_ok=True)
    shutil.copy(os.path.join(args.userdir, '..', 'shared', nb["api_path"]), project_dir)

##########################################
# Share each notebook project          #
##########################################

    try:
        print('--Sharing project')
        invites = generate_invites(nb["shared_with"])
        spec = f'{{ "owner": "{gp_username}", "dir": "{slug}", "invites": {invites} }}'
        print(f'-- {spec}')
        share = Share(spec)  # Create a share from the request body
        share.validate_invites()  # Validate the invitees
        resp = share.save()  # Save the share to the database
    except Exception as e:
        print(f'Error creating share: {e}')

# Close the connection to the database
db.close()
