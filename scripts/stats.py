#!/usr/bin/env python

import commands
import smtplib
import datetime
import sys
import shutil
import base64
import json
from email.MIMEMultipart import MIMEMultipart
from email.MIMEText import MIMEText

if sys.version_info.major > 2:
    import urllib.request as urllib2
else:
    import urllib2

# Environment configuration
x = "???"
data_dir = '/home/user/'
home_dir = '/home/user/'
sudo_req = 'sudo '  # Make blank if sudo is not required
test_email = 'user@broadinstitute.org'
admin_login = 'username:password'
s3_bucket = 'gpnotebook-backup'

# Handle arguments
test_run = True if (len(sys.argv) >= 2 and sys.argv[1] == '--test') else False


def _poll_docker(image):
    """
    Poll DockerHub for stats on the GenePattern images
    :param image:
    :return:
    """
    request = urllib2.Request('https://registry.hub.docker.com/v2/repositories/genepattern/' + image + '/')
    response = urllib2.urlopen(request)
    json_str = response.read().decode('utf-8')
    image_json = json.loads(json_str)
    return {'stars': image_json['star_count'], 'pulls': image_json['pull_count']}


def get_docker():
    """
    Gather all the available Docker stats
    :return:
    """
    docker = {}
    docker['notebook'] = _poll_docker('genepattern-notebook')
    docker['jupyterhub'] = {'stars': 1, 'pulls': 180}
    return docker


def _poll_genepattern(gp_url, tag):
    """
    Poll the provided GenePattern server for the number of GenePattern Notebook jobs launched in the last week

    :param gp_url: The URL of the GenePattern server, not including /gp...
    :return: Return the number of GenePattern Notebook jobs launched on this server
    """
    try:
        request = urllib2.Request(gp_url + '/gp/rest/v1/jobs/?tag=' + tag + '&pageSize=1000&includeChildren=true&includeOutputFiles=false&includePermissions=false')
        base64string = base64.encodestring(bytearray(admin_login, 'utf-8')).decode('utf-8').replace('\n', '')
        request.add_header("Authorization", "Basic %s" % base64string)
        response = urllib2.urlopen(request)
        json_str = response.read().decode('utf-8')
        jobs_json = json.loads(json_str)
        count = 0
    except urllib2.URLError:
        return 'ERROR'

    for job in jobs_json['items']:
        timestamp = job['dateSubmitted']
        date = datetime.datetime.strptime(timestamp.split('T')[0], '%Y-%m-%d')
        if date >= datetime.datetime.now() - datetime.timedelta(days=8):
            count += 1
        if 'children' in job:
            child_count = len(job['children']['items'])
            count += child_count

    return count


def get_total_jobs(weekly_jobs):
    # Read the file of total jobs
    jobs_file = file(home_dir + 'jobs.lst', 'r')
    jobs_list = jobs_file.readlines()
    jobs_list = [j.strip() for j in jobs_list]  # Clean new lines

    # Create the total jobs object
    total_jobs = {}
    total_jobs['prod'] = int(jobs_list[0]) + (0 if not isinstance(weekly_jobs['prod'], int) else weekly_jobs['prod'])
    total_jobs['broad'] = int(jobs_list[1]) + (0 if not isinstance(weekly_jobs['broad'], int) else weekly_jobs['broad'])
    total_jobs['iu'] = int(jobs_list[2]) + (0 if not isinstance(weekly_jobs['iu'], int) else weekly_jobs['iu'])
    total_jobs['aws'] = int(jobs_list[3]) + (0 if not isinstance(weekly_jobs['aws'], int) else weekly_jobs['aws'])
    total_jobs['prod-py'] = int(jobs_list[4]) + (0 if not isinstance(weekly_jobs['prod-py'], int) else weekly_jobs['prod-py'])
    total_jobs['broad-py'] = int(jobs_list[5]) + (0 if not isinstance(weekly_jobs['broad-py'], int) else weekly_jobs['broad-py'])
    total_jobs['iu-py'] = int(jobs_list[6]) + (0 if not isinstance(weekly_jobs['iu-py'], int) else weekly_jobs['iu-py'])
    total_jobs['aws-py'] = int(jobs_list[7]) + (0 if not isinstance(weekly_jobs['aws-py'], int) else weekly_jobs['aws-py'])

    # Write the new totals back to the file
    if not test_run:
        jobs_file = file(home_dir + 'jobs.lst', 'w')
        jobs_file.write("%s\n" % total_jobs['prod'])
        jobs_file.write("%s\n" % total_jobs['broad'])
        jobs_file.write("%s\n" % total_jobs['iu'])
        jobs_file.write("%s\n" % total_jobs['aws'])
        jobs_file.write("%s\n" % total_jobs['prod-py'])
        jobs_file.write("%s\n" % total_jobs['broad-py'])
        jobs_file.write("%s\n" % total_jobs['iu-py'])
        jobs_file.write("%s\n" % total_jobs['aws-py'])
        jobs_file.close()

    return total_jobs


def _read_s3_stats(log_file):
    """
    Read the s3 file with the logged job counts
    """

    # Copy the s3 log file to local disk
    commands.getstatusoutput('aws s3 cp s3://' + s3_bucket + '/' + log_file + ' ' + home_dir + log_file)

    # Read the log file
    jobs_file = file(home_dir + log_file, 'r')
    jobs_list = jobs_file.readlines()
    jobs_list = [j.strip() for j in jobs_list]  # Clean new lines
    jobs_file.close()

    return [int(jobs_list[0]), int(jobs_list[1])]


def get_weekly_jobs():
    """
    Assemble the number of GenePattern Notebook jobs launched on each server
    """
    weekly_jobs = {}
    weekly_jobs['prod'] = _poll_genepattern('https://genepattern.broadinstitute.org', 'GenePattern%20Notebook')
    # weekly_jobs['broad'] = _poll_genepattern('https://gpbroad.broadinstitute.org', 'GenePattern%20Notebook')
    weekly_jobs['iu'] = _poll_genepattern('https://gp.indiana.edu', 'GenePattern%20Notebook')
    weekly_jobs['aws'] = _poll_genepattern('https://gp-beta-ami.genepattern.org', 'GenePattern%20Notebook')

    weekly_jobs['prod-py'] = _poll_genepattern('https://genepattern.broadinstitute.org', 'GenePattern%20Python%20Client')
    # weekly_jobs['broad-py'] = _poll_genepattern('https://gpbroad.broadinstitute.org', 'GenePattern%20Python%20Client')
    weekly_jobs['iu-py'] = _poll_genepattern('https://gp.indiana.edu', 'GenePattern%20Python%20Client')
    weekly_jobs['aws-py'] = _poll_genepattern('https://gp-beta-ami.genepattern.org', 'GenePattern%20Python%20Client')

    weekly_jobs['broad'], weekly_jobs['broad-py'] = _read_s3_stats('job_count.log')

    return weekly_jobs


def get_disk_usage():
    """
    Handle determining disk usage on this VM
    """
    disk = {}

    # Get the amount of general disk space used
    cmd_out = commands.getstatusoutput('df -h | grep "/dev/xvda1"')[1]
    cmd_parts = cmd_out.split()
    disk["gen_disk_used"] = cmd_parts[2]
    disk["gen_disk_total"] = cmd_parts[3]
    disk["gen_disk_percent"] = cmd_parts[4]

    # Get the amount of Docker disk space used
    cmd_out = commands.getstatusoutput('df -h | grep "tmpfs"')[1]
    cmd_parts = cmd_out.split()
    disk["docker_disk_used"] = cmd_parts[2]
    disk["docker_disk_total"] = cmd_parts[3]
    disk["docker_disk_percent"] = cmd_parts[4]

    return disk


def get_nb_count():
    """
    Count the number of notebooks on the server
    """

    # Gather a list of all running containers
    cmd_out = commands.getstatusoutput(sudo_req + 'docker ps')[1]
    cmd_lines = cmd_out.split('\n')

    # For each container, get the count
    nb_count = {}
    nb_count['week'] = 0
    nb_count['total'] = 0
    nb_count['files_week'] = 0
    nb_count['files_total'] = 0

    if not test_run:
        # Weekly query
        cmd_out = commands.getstatusoutput("find " + data_dir + " -type f -not -path '*/\.*' -mtime -7 -name *.ipynb | wc -l")[1]
        user_week = int(cmd_out.strip())
        nb_count['week'] += user_week

        # Total query
        cmd_out = commands.getstatusoutput("find " + data_dir + " -type f -not -path '*/\.*' -name *.ipynb | wc -l")[1]
        user_total = int(cmd_out.strip())
        nb_count['total'] += user_total

        # All files query, weekly
        cmd_out = commands.getstatusoutput("find " + data_dir + " -type f -not -path '*/\.*' -mtime -7 | wc -l")[1]
        files_week = int(cmd_out.strip())
        nb_count['files_week'] += files_week - user_week

        # All files query, total
        cmd_out = commands.getstatusoutput("find " + data_dir + " -type f -not -path '*/\.*' | wc -l")[1]
        files_total = int(cmd_out.strip())
        nb_count['files_total'] += files_total - user_total

    return nb_count


def _genepattern_users():
    """
    Poll the provided GenePattern server for the number of GenePattern Notebook jobs launched in the last week

    :param gp_url: The URL of the GenePattern server, not including /gp...
    :return: Return the number of GenePattern Notebook jobs launched on this server
    """
    try:
        start_date = datetime.datetime.strftime(datetime.datetime.now() - datetime.timedelta(days=30), "%Y-%m-%d+01:01:01")
        request = urllib2.Request('https://genepattern.broadinstitute.org/gp/rest/v1/users/new?start=' + start_date)
        base64string = base64.encodestring(bytearray(admin_login, 'utf-8')).decode('utf-8').replace('\n', '')
        request.add_header("Authorization", "Basic %s" % base64string)
        response = urllib2.urlopen(request)
        json_str = response.read().decode('utf-8')
        user_json = json.loads(json_str)
        return user_json['users']
    except urllib2.URLError:
        return 'ERROR'


def _get_user_email(gp_users, user):
    # If list is an error, return error
    if gp_users == 'ERROR':
        return 'ERROR'

    # Iterate over the list of users, return matching user's email
    for u in gp_users:
        if u['username'].lower() == user:
            return u['email']

    # If no user was found, return blank
    return ''


def get_users():
    """
    Counts the number of new and returning users to the GP Notebook Repo
    :return:
    """
    users = {}

    # Read the file of existing users
    user_file = file(home_dir + 'users.lst', 'r')
    user_list = user_file.readlines()
    user_list = [u.strip() for u in user_list]  # Clean new lines

    # Gather a list of all running containers
    cmd_out = commands.getstatusoutput("sqlite3 " + home_dir + "jupyterhub.sqlite 'select name from users;'")[1]
    containers = cmd_out.split('\n')

    # Get a list of all new users
    new_users = list(set(containers) - set(user_list))

    # Query the GenePattern public server for info about new users
    gp_users = _genepattern_users()

    # Create the HTML row list for all new users
    new_users_rows = ''
    for user in new_users:
        # Get the user email or fall back to blank
        email = _get_user_email(gp_users, user)
        new_users_rows = new_users_rows + '<tr><td>' + user + '</td><td>' + email + '</td></tr>'

    # Get the sets of users
    users['returning'] = len(set(user_list) & set(containers))
    users['new'] = len(set(containers) - set(user_list))
    users['total'] = len(set(user_list) | set(containers))
    users['new_users'] = new_users_rows

    # Update the users file
    if not test_run:
        user_file = file(home_dir + 'users.lst', 'w')
        for u in (set(user_list) | set(containers)):
            user_file.write("%s\n" % u)
        user_file.close()

    return users


def get_logins():
    """
    Get number of logins this week
    :return:
    """
    logins = {}

    # Count the number of logins in the weekly log
    cmd_out = commands.getstatusoutput('cat ~/nohup.out | grep -c "User logged in"')[1]
    logins['week'] = int(cmd_out.strip())

    # Read the total number of logins
    login_file = file(home_dir + 'logins.log', 'r')
    total_count = login_file.read().strip()
    if len(total_count) == 0:  # Handle an empty file
        total_count = 0
    else:
        total_count = int(total_count)

    # Add logins and update file
    total_count += logins['week']
    logins['total'] = total_count
    if not test_run:
        login_file = file(home_dir + 'logins.log', 'w')
        login_file.write(str(total_count))
        login_file.close()

    # Move the log to backup
    if not test_run:
        shutil.copyfileobj(file(home_dir + 'nohup.out', 'r'), file(home_dir + 'nohup.out.old', 'w'))
        open(home_dir + 'nohup.out', 'w').close()

    return logins


def send_mail(users, logins, disk, nb_count, weekly_jobs, docker, total_jobs):
    """
    Send the weekly report in an email
    :param disk:
    :return:
    """
    today = str(datetime.date.today())
    fromaddr = "gp-dev@broadinstitute.org" if not test_run else test_email
    toaddr = "gp-exec@broadinstitute.org, gp-dev@broadinstitute.org" if not test_run else test_email
    msg = MIMEMultipart()
    msg['From'] = fromaddr
    msg['To'] = toaddr
    msg['Subject'] = "GenePattern Notebook Usage Statistics, week ending " + today

    body = """
        <html>
            <body>
                <h1>GenePattern Notebook Report, week ending %s</h1>
                <table width="100%%">
                    <tr>
                        <td width="50%%" valign="top">
                            <h2>Notebook Repository</h2>
                            <h3>Repository users</h3>
                            <table border="1">
                                <tr>
                                    <th>Users</th>
                                    <th>#</th>
                                </tr>
                                <tr>
                                    <td>All-time users</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>Weekly returning</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>Weekly new</td>
                                    <td>%s</td>
                                </tr>
                            </table>

                            <h3>Repository user logins</h3>
                            <table border="1">
                                <tr>
                                    <th>Logins</th>
                                    <th>#</th>
                                </tr>
                                <tr>
                                    <td>All-time total</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>This week</td>
                                    <td>%s</td>
                                </tr>
                            </table>

                            <h3>Repository notebooks created</h3>
                            <table border="1">
                                <tr>
                                    <th>Notebooks</th>
                                    <th>#</th>
                                </tr>
                                <tr>
                                    <td>Total in repository</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>Modified this week</td>
                                    <td>%s</td>
                                </tr>
                            </table>

                            <h3>Repository non-notebook files</h3>
                            <table border="1">
                                <tr>
                                    <th>Files</th>
                                    <th>#</th>
                                </tr>
                                <tr>
                                    <td>Total in repository</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>Modified this week</td>
                                    <td>%s</td>
                                </tr>
                            </table>

                            <h3>Repository disk space used</h3>
                            <table border="1">
                                <tr>
                                    <th>File System</th>
                                    <th>Used</th>
                                    <th>Total</th>
                                    <th>Percent</th>
                                </tr>
                                <tr>
                                    <td>General Disk</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>Docker Disk</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                            </table>

                            <h3>New Users This Week</h3>
                            <table border="1">
                                <tr>
                                    <th>Username</th>
                                    <th>Email</th>
                                </tr>
                                %s
                            </table>
                        </td>
                        <td width="50%%" valign="top">
                            <h2>Notebook Extension</h2>
                            <h3>Notebook jobs run this week</h3>
                            <table border="1">
                                <tr>
                                    <th>Server</th>
                                    <th>Notebook</th>
                                    <th>Python</th>
                                </tr>
                                <tr>
                                    <td>GP Prod</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>GP Broad</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>GP IU</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>GP AWS</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                            </table>
                            
                            <h3>All time notebook jobs run</h3>
                            <table border="1">
                                <tr>
                                    <th>Server</th>
                                    <th>Notebook</th>
                                    <th>Python</th>
                                </tr>
                                <tr>
                                    <td>GP Prod</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>GP Broad</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>GP IU</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>GP AWS</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                            </table>

                            <h3>DockerHub stats</h3>
                            <table border="1">
                                <tr>
                                    <th>Image</th>
                                    <th>Stars</th>
                                    <th>Pulls</th>
                                </tr>
                                <tr>
                                    <td>gp-notebook</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                                <tr>
                                    <td>gp-jupyterhub (retired)</td>
                                    <td>%s</td>
                                    <td>%s</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
        </html>
    """ % (
        # Header
        today,

        # Total users
        users['total'],
        users['returning'],
        users['new'],

        # Weekly logins
        logins['total'],
        logins['week'],

        # Notebook files
        nb_count['total'],
        nb_count['week'],
        nb_count['files_total'],
        nb_count['files_week'],

        # Disk Usage
        disk["gen_disk_used"],
        disk["gen_disk_total"],
        disk["gen_disk_percent"],
        disk["docker_disk_used"],
        disk["docker_disk_total"],
        disk["docker_disk_percent"],

        # List New Users
        users['new_users'],

        # Weekly jobs
        weekly_jobs['prod'], weekly_jobs['prod-py'],
        weekly_jobs['broad'], weekly_jobs['broad-py'],
        weekly_jobs['iu'], weekly_jobs['iu-py'],
        weekly_jobs['aws'], weekly_jobs['aws-py'],

        # Total jobs
        total_jobs['prod'], total_jobs['prod-py'],
        total_jobs['broad'], total_jobs['broad-py'],
        total_jobs['iu'], total_jobs['iu-py'],
        total_jobs['aws'], total_jobs['aws-py'],

        # Docker stats
        docker['notebook']['stars'], docker['notebook']['pulls'],
        docker['jupyterhub']['stars'], docker['jupyterhub']['pulls'])

    msg.attach(MIMEText(body, 'html'))

    server = smtplib.SMTP('localhost', 25)
    text = msg.as_string()
    server.sendmail(fromaddr, toaddr.split(', '), text)
    server.quit()


# Make necessary calls
disk = get_disk_usage()
nb_count = get_nb_count()
users = get_users()
logins = get_logins()
weekly_jobs = get_weekly_jobs()
docker = get_docker()
total_jobs = get_total_jobs(weekly_jobs)
send_mail(users, logins, disk, nb_count, weekly_jobs, docker, total_jobs)
