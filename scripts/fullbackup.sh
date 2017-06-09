#!/bin/bash

# Make the full backup

# Delete the old backup
/usr/local/bin/aws s3 rm s3://gpnotebook-backup/full-backup --recursive

# Copy shared directory
/usr/local/bin/aws s3 sync /home/thorin/* s3://gpnotebook-backup/full-backup