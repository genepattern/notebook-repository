#!/opt/conda/envs/repository/bin/python

import asyncio
import os
import shutil
import settings
import sys
from urllib.parse import quote

# Fix SSL issue with chromium
os.environ["PYPPETEER_DOWNLOAD_HOST"] = "http://storage.googleapis.com"
from pyppeteer import launch


BASE_HUB_URL = getattr(settings, 'BASE_HUB_URL', "https://notebook.genepattern.org")
SCREENSHOT_USER = getattr(settings, 'SCREENSHOT_USER', "xxx")
SCREENSHOT_PASSWORD = getattr(settings, 'SCREENSHOT_PASSWORD', "xxx")


def patch_pyppeteer():
    import pyppeteer.connection
    original_method = pyppeteer.connection.websockets.client.connect

    def new_method(*args, **kwargs):
        kwargs['ping_interval'] = None
        kwargs['ping_timeout'] = None
        return original_method(*args, **kwargs)

    pyppeteer.connection.websockets.client.connect = new_method


def get_path_arg():
    if len(sys.argv) >= 2:
        return sys.argv[1]
    else:
        return None


async def fetch_screenshot(nb_file_path):
    # Obtain the necessary paths and URLs
    nb_dir_path = os.path.dirname(nb_file_path)
    nb_file_name = nb_file_path.split(os.path.sep)[-1]
    nb_url = BASE_HUB_URL + '/hub/login/form?next=' + '/user/' + quote(SCREENSHOT_USER) + '/notebooks/' + quote(nb_file_name)
    screenshot_path = os.path.join(nb_dir_path, 'preview.png')
    user_dir_path = os.path.join(settings.BASE_USER_PATH, SCREENSHOT_USER)

    # Lazily create directory, if necessary
    if not os.path.exists(user_dir_path):
        os.mkdir(user_dir_path)

    # Make sure the directory is a directory
    if not os.path.isdir(user_dir_path):
        return 'An error was encountered because the user directory is not a directory'

    # Create the browser and page objects
    browser = await launch({'args': ['--no-sandbox']})
    page = await browser.newPage()
    await page.setViewport({'width': 1200, 'height': 1000})

    # Copy the notebook to the screenshot user's space
    shutil.copy(nb_file_path, user_dir_path)

    # Open the page and login to the repository
    await page.goto(nb_url, {'timeout': 120000})
    await page.type('#username_input', SCREENSHOT_USER)
    await page.type('#password_input', SCREENSHOT_PASSWORD)
    await page.click('#login_submit')
    await page.waitFor(10000)

    # Check for errors and spawning page
    start_server = await page.querySelector('#start') is not None
    spawn_form = await page.querySelector('#spawn_form') is not None
    spawning = await page.querySelector('#progress-message') is not None
    in_notebook = await page.querySelector('#ipython-main-app') is not None
    if not start_server and not spawn_form and not spawning and not in_notebook:
        return 'An error was encountered logging in to the notebook repository'

    # If the server is not started, start it and recheck
    if start_server:
        await page.click('#start')
        await page.waitFor(5000)
        spawning = await page.querySelector('#progress-message') is not None
        spawn_form = await page.querySelector('#spawn_form') is not None

    # If the server is not started, start it and recheck
    if spawn_form:
        await page.click('input.btn-jupyter[value=Spawn]')
        await page.waitFor(5000)
        spawning = await page.querySelector('#progress-message') is not None

    # If spawning, continue to wait and recheck
    if spawning:
        await page.waitFor(10000)
        in_notebook = await page.querySelector('#ipython-main-app') is not None
        if not in_notebook:
            return 'An error was encountered spawning the notebook server'

    # Wait for the widgets to load
    await page.waitFor(5000)

    # Close the webtour, if visible
    showing_webtour = await page.querySelector('#gp-hint-box') is not None
    if showing_webtour:
        await page.evaluate("$('a.introjs-skipbutton').click();")

    # Check for GP Auth widgets and log in
    has_auth_widget = await page.querySelector('.gp-widget-auth') is not None

    if has_auth_widget:  # Login to the GenePattern server
        await page.evaluate("$('.widget-auto-login-buttons > .btn-primary').click();")

    await page.waitFor(5000)

    # Fix the CSS for the screenshot
    await page.evaluate("$('#login_widget').hide();")
    await page.evaluate("$('body').css('overflow', 'auto');")
    await page.evaluate("$('#site').css('overflow', 'unset');")
    await page.evaluate("$('.widget-username-label').html('&nbsp;');")

    # Take a screenshot
    await page.screenshot({'path': screenshot_path, 'fullPage': True})
    await browser.close()


patch_pyppeteer()  # Workaround for pyppeteer timeout error
notebook_file_path = get_path_arg()
asyncio.get_event_loop().run_until_complete(fetch_screenshot(notebook_file_path))
