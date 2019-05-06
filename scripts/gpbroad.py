#!/usr/bin/env python

import commands
import datetime
import sys
import base64
import json

if sys.version_info[0] > 2:
    import urllib.request as urllib2
else:
    import urllib2

# Environment configuration
admin_login = 'username:password'
home_dir = '/home/user/'


def _poll_genepattern(gp_url, tag):
    """
    Poll the provided GenePattern server for the number of GenePattern Notebook jobs launched in the last week

    :param gp_url: The URL of the GenePattern server, not including /gp...
    :return: Return the number of GenePattern Notebook jobs launched on this server
    """
    try:
        request = urllib2.Request(gp_url + '/gp/rest/v1/jobs/?tag=' + tag + '&pageSize=1000&includeChildren=true&includeOutputFiles=false&includePermissions=false')
        if sys.version_info[0] > 2:
            base64string = base64.encodestring(bytearray(admin_login, 'utf-8')).decode('utf-8').replace('\n', '')
        else:
            base64string = base64.encodestring(admin_login).decode('utf-8').replace('\n', '')
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


def get_weekly_jobs():
    """
    Assemble the number of GenePattern Notebook jobs launched on each server
    """
    weekly_jobs = {}
    weekly_jobs['broad'] = _poll_genepattern('https://gpbroad.broadinstitute.org', 'GenePattern%20Notebook')
    weekly_jobs['broad-py'] = _poll_genepattern('https://gpbroad.broadinstitute.org', 'GenePattern%20Python%20Client')
    return weekly_jobs


def push_job_count(weekly_jobs):
    """
    Write the job count to disk and push that file to S3
    """
    log_file = 'job_count.log'

    # Write job count to disk
    login_file = file(home_dir + log_file, 'w')
    login_file.write(str(weekly_jobs['broad']) + '\n' + str(weekly_jobs['broad-py']))
    login_file.close()

    # Push job count to S3
    cmd_out = commands.getstatusoutput('aws s3 cp ' + home_dir + log_file + ' s3://gpnotebook-backup/' + log_file)[1]
    print(cmd_out)


# Query gpbroad and push the job count to S3
weekly_jobs = get_weekly_jobs()
push_job_count(weekly_jobs)