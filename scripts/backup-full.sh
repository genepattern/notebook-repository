#!/bin/bash

# Make the full backup

# Delete the old backup
aws s3 rm s3://gpnotebook-backup/full-backup --recursive

# Copy the /data directory
aws s3 sync /data s3://gpnotebook-backup/full-backup