#!/usr/bin/env python
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests
import smtplib

error_report = ''
r = None

# Attempt to reach the HTTP -> HTTPS redirect
try:
    r = requests.get('http://notebook.genepattern.org', allow_redirects=False, timeout=30)
except requests.Timeout as e:
    error_report += "Unable to reach the Notebook Repository's HTTP -> HTTPS redirect.\n"
if r is not None and r.status_code != 301:
    error_report += "Got unexpected status code from the Notebook Repository's HTTP -> HTTPS redirect (" + str(r.status_code) + ").\n"

# Attempt to reach the hub
try:
    r = requests.get('https://notebook.genepattern.org', timeout=30)
except requests.Timeout as e:
    error_report += "Unable to the the Notebook Repository login page.\n"
if r is not None and r.status_code != 200:
    error_report += "Got unexpected status code from the Notebook Repository login page (" + str(r.status_code) + ").\n"

if error_report != '':
    server = smtplib.SMTP('localhost', 25)
    fromaddr = 'gp-dev@broadinstitute.org'
    toaddr = 'gp-dev@broadinstitute.org'
    msg = MIMEMultipart()
    msg['From'] = fromaddr
    msg['To'] = toaddr
    msg['Subject'] = 'GenePattern Notebook Monitoring Script'
    msg.attach(MIMEText(error_report, 'text'))
    text = msg.as_string()
    server.sendmail(fromaddr, toaddr.split(', '), text)
    server.quit()