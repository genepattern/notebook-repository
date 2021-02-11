import shutil


def zip_dir(src_path, dest_path):
    if dest_path.endswith('.zip'): dest_path = dest_path[:-4]
    shutil.make_archive(dest_path, 'zip', src_path)


def unzip_dir(src_path, dest_path):
    shutil.unpack_archive(src_path, dest_path, 'zip')
