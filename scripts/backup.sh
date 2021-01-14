#!/bin/bash

# Set variables
export today=`date '+%Y_%m_%d'`
export backup="workspace_backup_$today"

# Make the backup, copy the data directory
/home/ubuntu/.local/bin/aws s3 sync /data s3://gpnotebook-backup/$backup

# Remove the old backups
# /home/ubuntu/.local/bin/aws s3 ls s3://gpnotebook-backup | awk '{print $2}' | grep -v $backup | grep -E -i 'workspace_backup_' | xargs -I% bash -c 'aws s3 rm --recursive s3://gpnotebook-backup/%'