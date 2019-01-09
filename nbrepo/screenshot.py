#!/home/thorin/config/anaconda/envs/jupyterhub/bin/python
import asyncio
import os
import shutil
import settings
import sys
from urllib.parse import quote
from pyppeteer import launch


BASE_HUB_URL = "https://notebook.genepattern.org"
SCREENSHOT_USER = "xxx"
SCREENSHOT_PASSWORD = "xxx"


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
    nb_url = BASE_HUB_URL + '/user/' + quote(SCREENSHOT_USER) + '/notebooks/' + quote(nb_file_name)
    screenshot_path = os.path.join(nb_dir_path, 'preview.png')
    user_dir_path = os.path.join(settings.BASE_USER_PATH, SCREENSHOT_USER)

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

    # Check for errors and handle them gracefully
    no_login = await page.querySelector('#ipython-main-app') is None
    if no_login:
        return 'An error was encountered logging in to the notebook repository'

    await page.waitFor(5000)

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
