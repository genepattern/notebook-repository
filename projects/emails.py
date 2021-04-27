import hashlib
import re
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from .config import Config


def is_email(email):
    if len(email) > 7:
        if re.match("^[_a-z0-9-]+(\.[_a-z0-9-]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]{2,4})$", email.lower()) is not None:
            return True
    return False


def send_email(to_email, subject, message):
    config = Config.instance()
    email = create_email(config.FROM_EMAIL, to_email, subject, message)
    attempts = 0

    while attempts < 3:
        try:
            attempt_send(email)
            break
        except:
            time.sleep(3)
            attempts += 1


def attempt_send(email):
    config = Config.instance()
    server = smtplib.SMTP(config.EMAIL_SERVER, 25)
    if hasattr(config, 'EMAIL_USERNAME'):
        server.login(config.EMAIL_USERNAME, config.EMAIL_PASSWORD)
    text = email.as_string()
    server.sendmail(email['From'], email['To'].split(', '), text)
    server.quit()


def create_email(from_email, to_email, subject, message):
    """Create email message object"""
    msg = MIMEMultipart()
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(message, 'html'))
    return msg


def generate_email_body(invite_id, token, base_url, share_dict):
    owner = share_dict['owner']
    project_name = share_dict['project']['display_name'] if 'project' in share_dict else share_dict['dir']
    return f"""
        <p>{owner} has invited you to share the project "{project_name}" on the GenePattern Notebook Workspace:. 
            To accept, click the link below and sign in if prompted.</p>
    
        <h5>Click below to accept the sharing invite</h5>
        <p><a href="{base_url}/services/projects/sharing/invite/{invite_id}/?token={token}">
            {base_url}/services/projects/sharing/invite/{invite_id}/?token={token}</a></p>
        """


def generate_token(id, email):
    return str(hashlib.sha224(bytes(id) + bytes(email, 'UTF-8')).hexdigest())


def validate_token(token, id, email):
    """Validate the token for the provided invite"""
    return token == generate_token(id, email)


def send_invite_email(id, email, host_url, share_dict):
    """Send a notebook sharing invite to the provided email address"""
    token = generate_token(id, email)                                           # Generate the invite token
    subject_line = 'Sharing Invite - GenePattern Notebook Workspace'            # Set the subject line
    send_email(email, subject_line, generate_email_body(id, token,              # Send the email
                                                        host_url, share_dict))
