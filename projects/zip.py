import os
import zipfile


def zip_dir(src_path, dest_path):
    archive = zipfile.ZipFile(dest_path, 'w', zipfile.ZIP_DEFLATED)
    for root, dirs, files in os.walk(src_path):
        for file in files:
            archive.write(os.path.join(root, file))
    archive.close()


def extract_dir(src_path, dest_path):
    # TODO: Implement
    pass
    # archive = zipfile.ZipFile(dest_path, 'w', zipfile.ZIP_DEFLATED)
    # for root, dirs, files in os.walk(src_path):
    #     for file in files:
    #         archive.write(os.path.join(root, file))
    # archive.close()
