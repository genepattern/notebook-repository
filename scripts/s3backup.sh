#!/bin/bash

# Set variables
today=`date '+%Y_%m_%d'`
backup="backup_$today"

# Make the backups

# Copy user notebooks
aws s3 sync ~/users s3://gpnotebook-backup/$backup/users

# Copy shared public notebooks
aws s3 sync ~/repository/notebooks s3://gpnotebook-backup/$backup/repository/notebooks

# Copy shared notebook database
aws s3 cp ~/repository/webservice/db.sqlite3 s3://gpnotebook-backup/$backup/repository/webservice/db.sqlite3
