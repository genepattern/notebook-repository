#!/bin/bash

# Set variables
export today=`date '+%Y_%m_%d'`
export backup="backup_$today"

# Make the backups

# Copy the data directory
/home/ubuntu/.local/bin/aws s3 sync /data s3://gpnotebook-backup/$backup