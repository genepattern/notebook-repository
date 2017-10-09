import json
import urllib

import requests
from notebook.services.contents.largefilemanager import LargeFileManager
# from notebook.services.contents.filemanager import FileContentsManager


SHARING_HOST = 'http://localhost:8000'


class SharingContentsManager(LargeFileManager):
    """Handle sharing files in the GenePattern Notebook Repository"""

    def _log(self, method, message):
        file = open('/Users/tabor/contents_manager.log', 'a')
        file.write(method.upper() + ': ' + message + '\n')
        file.close()

    def _get_entry(self, path):
        """
        Query the notebook server for sharing entries for the specified notebook

        Returns the ID of the entry if one is found, otherwise returns None
        """
        params = urllib.parse.urlencode({'api_path': path})
        query = requests.get(SHARING_HOST + '/sharing/?' + params)

        # Received an error, return None
        if query.status_code != 200:
            self._log('_get_entry', 'Error querying for notebook: ' + str(query.status_code) + ' | ' + str(path))
            return None, None

        # Parse the JSON response
        parsed_results = query.json()

        if 'results' in parsed_results:
            results = parsed_results['results']
            if len(results) > 0:
                notebook = results[0]
                if 'id' in notebook:
                    return (notebook['id'], notebook)
            else:
                return None, None

        # Parsing assumptions didn't pan out, report an error
        self._log('_get_entry', 'Error parsing results: ' + str(parsed_results))

    def _delete_entry(self, id):
        query = requests.delete(SHARING_HOST + '/sharing/' + str(id) + '/')

        # Received an error, log it
        if query.status_code != 200 and query.status_code != 204:
            self._log('_delete_entry', 'Error deleting sharing entry: ' + str(id) + ' | status: ' + str(query.status_code))

    def _rename_entry(self, id, entry, new_path):
        entry['file_path'] = new_path
        entry['api_path'] = new_path

        query = requests.put(SHARING_HOST + '/sharing/' + str(id) + '/', headers={'content-type': 'application/json'}, data=json.dumps(entry))

        # Received an error, log it
        if query.status_code != 200 and query.status_code != 204:
            self._log('_rename_entry', 'Error deleting sharing entry: ' + str(id) + ' | status: ' + str(query.status_code))

    def delete_file(self, path):
        """Delete the file in the superclass"""
        super(SharingContentsManager, self).delete_file(path)

        # Perform update of the sharing database, if necessary
        id, entry = self._get_entry(path)  # Get the id of the database entry if one exists
        if id is not None:  # If an entry was found
            self._delete_entry(id)

    def rename_file(self, old_path, new_path):
        """Rename the file in the superclass"""
        result = super(SharingContentsManager, self).rename_file(old_path, new_path)

        # Perform update of the sharing database, if necessary
        id, entry = self._get_entry(old_path)  # Get the id of the database entry if one exists
        if id is not None:  # If an entry was found
            self._rename_entry(id, entry, new_path)
        return result
