import os
import shutil
import threading
import zipfile
from datetime import datetime


def zip_dir(src_path, dest_path):
    if dest_path.endswith('.zip'): dest_path = dest_path[:-4]
    threading.Thread(target=shutil.make_archive, args=(dest_path, 'zip', src_path)).start()  # Zip dir in its own thread


def unzip_dir(src_path, dest_path):
    shutil.unpack_archive(src_path, dest_path, 'zip')
    for root, dirs, files in os.walk(dest_path):
        for d in dirs: os.chmod(os.path.join(root, d), 0o777)
        for f in files: os.chmod(os.path.join(root, f), 0o777)


def list_files(zip_path):
    files = []
    for f in zipfile.ZipFile(zip_path).infolist():
        if not f.filename.startswith('.'):
            files.append({'filename': f.filename,
                          'size': sizeof_fmt(f.file_size),
                          'modified': str(datetime(*f.date_time))})
    return files


def sizeof_fmt(num, suffix='B'):
    for unit in [' ',' K',' M',' G',' T',' P',' E',' Z']:
        if abs(num) < 1024.0:
            return "%3.0f%s%s" % (num, unit, suffix)
        num /= 1024.0
    return "%.1f%s%s" % (num, 'Yi', suffix)