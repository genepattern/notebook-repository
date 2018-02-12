#!/bin/bash

# Make the full backup

# Delete the old backup
/usr/local/bin/aws s3 rm s3://gpnotebook-backup/full-backup --recursive

# Copy repository directory
tar -cvzpf /tmp/repository.tar.gz /home/thorin/repository
/usr/local/bin/aws s3 cp /tmp/repository.tar.gz s3://gpnotebook-backup/full-backup/repository.tar.gz
rm /tmp/repository.tar.gz

# Copy scripts directory
tar -cvzpf /tmp/scripts.tar.gz /home/thorin/scripts
/usr/local/bin/aws s3 cp /tmp/scripts.tar.gz s3://gpnotebook-backup/full-backup/scripts.tar.gz
rm /tmp/scripts.tar.gz

# Copy shared directory
tar -cvzpf /tmp/shared.tar.gz /home/thorin/shared
/usr/local/bin/aws s3 cp /tmp/shared.tar.gz s3://gpnotebook-backup/full-backup/shared.tar.gz
rm /tmp/shared.tar.gz

# Copy user directory
tar --no-recursion -cvzpf /tmp/home.tar.gz /home/thorin/*
/usr/local/bin/aws s3 cp /tmp/home.tar.gz s3://gpnotebook-backup/full-backup/home.tar.gz
rm /tmp/home.tar.gz