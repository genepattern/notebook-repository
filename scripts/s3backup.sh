#!/bin/bash

# Set variables
export today=`date '+%Y_%m_%d'`
export backup="backup_$today"

# Make the backups

# Copy user notebooks
/usr/local/bin/aws s3 sync /home/thorin/users s3://gpnotebook-backup/$backup/users

# Copy shared public notebooks
/usr/local/bin/aws s3 sync /home/thorin/repository/notebooks s3://gpnotebook-backup/$backup/repository/notebooks

# Copy shared notebook database
/usr/local/bin/aws s3 cp /home/thorin/repository/webservice/db.sqlite3 s3://gpnotebook-backup/$backup/repository/webservice/db.sqlite3
