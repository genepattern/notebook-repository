#!/usr/bin/env python

# # DUMP THE SQLITE DATABASE
#
# sqlite3 projects.sqlite
#     .output projects.sql
#     .dump
#     .exit
#
# # TURN OFF MYSQL STRICT MODE
#
# mysql -u projects -p projects
#     set global sql_mode=''
#     exit;
#
# # CLEAN THE DATA - THIS SCRIPT
#     Remove all lines that don't start with "INSERT INTO"
#     Move citation column of projects table
#
# # IMPORT DATA
#
#  mysql -u projects -p projects < projects.sql

# Read in the file
with open('../data/projects.sql', 'r') as file :
    filedata = file.read()

# Remove non-"insert into" lines
cleandata = ''
for line in filedata.splitlines():
    if line.startswith('INSERT INTO'):
        cleandata += line + '\n'

# Move citation column of projects table
filedata = ''
for line in cleandata.splitlines():
    if line.startswith('INSERT INTO projects'):
        try:
            index = line.index(",'Release',")
            length = 11
        except ValueError:
            try:
                index = line.index(",'Beta',")
                length = 8
            except ValueError:
                index = line.index(",'Development',")
                length = 15
        filedata += line[:index+length] + "'CITATION'," + line[index+length:-5] + ");\n"
    else:
        filedata += line + '\n'

# Write the file out again
with open('../data/projects.sql', 'w') as file:
    file.write(filedata)
