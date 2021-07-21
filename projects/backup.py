import shutil
import threading
from datetime import datetime, timedelta
from .config import Config


_last_backup = None
_backup_waiting = False


def database_from_backup():
    """Copy the backup database file to the in-use database path.
        This is normally done when the server first starts up, as the in-use path points to an ephemeral directory"""
    shutil.copy(Config.instance().DB_BACKUP_PATH, Config.instance().DB_PATH)


def backup_database():
    global _last_backup, _backup_waiting

    # Perform a backup if not already backed up in the last minute
    minute_ago = datetime.now() - timedelta(minutes=1)
    if _last_backup is None or _last_backup < minute_ago:
        def copy_to_backup():  # Function to perform the database copy
            shutil.copy(Config.instance().DB_PATH, Config.instance().DB_BACKUP_PATH)

        _last_backup = datetime.now()                       # Set the last backup timestamp
        threading.Thread(target=copy_to_backup).start()     # Backup database in its own thread

    # If a backup happened recently, check again in another minute if checking is not already queued
    elif not _backup_waiting:
        def copy_and_flag():  # Function to perform the database copy and set _backup_waiting to false
            _last_backup = datetime.now()                   # Set the last backup timestamp
            _backup_waiting = False                         # A backup is no longer queued
            shutil.copy(Config.instance().DB_PATH, Config.instance().DB_BACKUP_PATH)

        _backup_waiting = True                              # A backup is now queued
        threading.Timer(60, copy_and_flag).start()
