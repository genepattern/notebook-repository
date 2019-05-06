#!/bin/bash

# Set variables
export today=`date '+%Y_%m_%d'`
export backup="backup_$today"

# Make the backups

# Copy user notebooks
aws s3 sync /data/users s3://gpnotebook-backup/$backup/users

# Copy shared public notebooks
aws s3 sync /data/repository s3://gpnotebook-backup/$backup/repository
aws s3 sync /data/shared s3://gpnotebook-backup/$backup/shared

# Copy shared notebook database
aws s3 cp /data/db.sqlite3 s3://gpnotebook-backup/$backup/db.sqlite3
