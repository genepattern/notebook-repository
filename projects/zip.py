import shutil
import zipfile
from datetime import datetime


def zip_dir(src_path, dest_path):
    if dest_path.endswith('.zip'): dest_path = dest_path[:-4]
    shutil.make_archive(dest_path, 'zip', src_path)


def unzip_dir(src_path, dest_path):
    shutil.unpack_archive(src_path, dest_path, 'zip')


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