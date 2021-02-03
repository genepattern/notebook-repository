/**
 * @author Thorin Tabor
 *
 * Display helpful hints and provide an automated tour of the notebook repository
 *     Depends on the notebook-repository service and GenePattern Notebook
 *
 * Copyright 2015-2019, Regents of the University of California & Broad Institute
 */

// Initialize GenePattern global variables
var GenePattern = GenePattern || {};
GenePattern.repo = GenePattern.repo || {};
GenePattern.repo.events_init = GenePattern.repo.events_init || false;
GenePattern.repo.public_notebooks = GenePattern.repo.public_notebooks || [];
GenePattern.repo.shared_notebooks = GenePattern.repo.shared_notebooks || [];
GenePattern.repo.my_shared_paths = GenePattern.repo.my_shared_paths || [];
GenePattern.repo.other_shared_paths = GenePattern.repo.other_shared_paths || [];
GenePattern.repo.my_nb_paths = GenePattern.repo.my_nb_paths || [];
GenePattern.repo.username = GenePattern.repo.username || null;
GenePattern.repo.repo_url = GenePattern.repo.repo_url || null;
GenePattern.repo.token = GenePattern.repo.token || null;
GenePattern.repo.last_refresh = GenePattern.repo.last_refresh || null;

// Define the nbextension
define("library", [
    'jquery',
    '/hub/static/js/jquery.dataTables.min.js'], function($, datatables) {

    "use strict";

    /**
     * Patch the DataTables search function with one that ignores special characters and accents
     */
    function init_table_search() {
        const _div = document.createElement('div');
        $.fn.dataTable.ext.type.search.html = function(data) {
            _div.innerHTML = data;
            return _div.textContent ?
                _div.textContent
                    .replace(/[&\/\\#,+()$~%.'":*?<>{}\-_!@=|^`;\[\]]/g, '')
                    .replace(/[áÁàÀâÂäÄãÃåÅæÆ]/g, 'a')
                    .replace(/[çÇ]/g, 'c')
                    .replace(/[éÉèÈêÊëË]/g, 'e')
                    .replace(/[íÍìÌîÎïÏîĩĨĬĭ]/g, 'i')
                    .replace(/[ñÑ]/g, 'n')
                    .replace(/[óÓòÒôÔöÖœŒ]/g, 'o')
                    .replace(/[ß]/g, 's')
                    .replace(/[úÚùÙûÛüÜ]/g, 'u')
                    .replace(/[ýÝŷŶŸÿ]/g, 'n') :
                _div.innerText
                    .replace(/[&\/\\#,+()$~%.'":*?<>{}\-_!@=|^`;\[\]]/g, '')
                    .replace(/[áÁàÀâÂäÄãÃåÅæÆ]/g, 'a')
                    .replace(/[çÇ]/g, 'c')
                    .replace(/[éÉèÈêÊëË]/g, 'e')
                    .replace(/[íÍìÌîÎïÏîĩĨĬĭ]/g, 'i')
                    .replace(/[ñÑ]/g, 'n')
                    .replace(/[óÓòÒôÔöÖœŒ]/g, 'o')
                    .replace(/[ß]/g, 's')
                    .replace(/[úÚùÙûÛüÜ]/g, 'u')
                    .replace(/[ýÝŷŶŸÿ]/g, 'n');
        };
    }

    /**
     * Strip special characters and return the altered string
     *
     * @param raw_string
     * @returns {string}
     */
    function strip_special_characters(raw_string) {
        return raw_string.replace(/[&\/\\#,+()$~%.'":*?<>{}\-_!@=|^`;\[\]]/g, '')
    }

    /**
     * Get the api path to the selected notebook
     *
     * @returns {string|null}
     */
    function get_selected_path() {
        const checkbox = $('#notebook_list').find('input:checked');

        // Check to see if path is available in notebook
        if (Jupyter.notebook && Jupyter.notebook.notebook_path) {
            return window.location.pathname;
        }

        // Handle errors
        if (checkbox.length < 1) {
            console.log("ERROR: No selected notebooks found");
            return null;
        }

        return checkbox.parent().find("a.item_link").attr("href");
    }

    /**
     * Get the name of the selected notebook
     *
     * @returns {string|null}
     */
    function get_selected_name() {
        const checkbox = $('#notebook_list').find('input:checked');

        // Check to see if path if available in notebook
        if (Jupyter.notebook && Jupyter.notebook.notebook_path) {
            return Jupyter.notebook.notebook_name.replace(/\.[^/.]+$/, "");
        }

        // Handle errors
        if (checkbox.length < 1) {
            console.log("ERROR: No selected notebooks found");
            return null;
        }

        // Get file name
        const raw_name = checkbox.parent().find("a.item_link").text();

        // Remove .ipynb
        return raw_name.replace(/\.[^/.]+$/, "");
    }

    /**
     * Determine if the given api path is one of my published notebooks
     *
     * @param api_path
     * @returns {boolean}
     */
    function is_nb_published(api_path) {
        return GenePattern.repo.my_nb_paths.indexOf(api_path) >= 0;
    }

    /**
     * Get the JSON info for the published notebook, return null otherwise
     *
     * @param api_path
     * @returns {object|null}
     */
    function get_published(api_path) {
        for (let i = 0; i < GenePattern.repo.public_notebooks.length; i++) {
            const nb = GenePattern.repo.public_notebooks[i];
            if (nb["api_path"] === api_path) {
                return nb;
            }
        }

        return null;
    }

    /**
     * Returns today in a date string readable by the REST API
     *
     * @returns {string}
     */
    function today() {
        const today = new Date();
        const month = ("0" + (today.getMonth() + 1)).slice(-2);
        const date = ("0" + today.getDate()).slice(-2);
        const year = today.getFullYear();
        return year + '-' + month + '-' + date;
    }

    /**
     * Returns current time in a datetime string readable by the REST API
     *
     * @returns {string}
     */
    function now() {
        const today = new Date();
        const month = ("0" + (today.getMonth() + 1)).slice(-2);
        const date = ("0" + today.getDate()).slice(-2);
        const year = today.getFullYear();
        const hours = ("0" + today.getHours()).slice(-2);
        const minutes = ("0" + today.getMinutes()).slice(-2);
        const seconds = ("0" + today.getSeconds()).slice(-2);
        return year + '-' + month + '-' + date + "T" + hours + ":" + minutes + ":" + seconds;
    }

    /**
     * Display the loading screen for the modal dialog
     */
    function modal_loading_screen() {
        const to_cover = $(".modal-body");
        const cover = $("<div></div>")
            .addClass("repo-modal-cover")
            .append($('<i class="fa fa-spinner fa-spin fa-3x fa-fw repo-modal-spinner"></i>'));
        to_cover.append(cover);
    }

    /**
     * Close the model dialog
     */
    function close_modal() {
        $(".modal-footer").find("button:contains('Cancel')").click();
    }

    /**
     * Returns a notebook json object based off of the current notebook and form
     *
     * @param notebook
     * @param nb_path
     * @returns {{owner: (*|Document.username|string|null), file_path: (string|null), api_path: (string|null)}}
     */
    function make_nb_json(notebook, nb_path) {
        const pub_nb = notebook ? notebook : {
            "owner": GenePattern.repo.username,
            "file_path": nb_path, // Will be replaced server-side
            "api_path": nb_path
        };

        // Set values based on form
        pub_nb['name'] = $("#publish-name").val();
        pub_nb['description'] = $("#publish-description").val();
        pub_nb['author'] = $("#publish-author").val();
        pub_nb['quality'] = $("#publish-quality").val();
        pub_nb['tags'] = $("#publish-tags").tagit("assignedTags").join(',');

        // Set the API path if it has been toggled
        if ($("#publish-path").is(":visible")) pub_nb['api_path'] = $("#publish-path").val();

        // Set current date as publication date
        pub_nb['publication'] = today();

        // Return the updated notebook
        return pub_nb;
    }

    /**
     * Returns whether the form has valid values or not
     *
     * @returns {boolean}
     */
    function form_valid() {
        let is_valid = true;

        // Check name
        if (!$("#publish-name").is(":valid")) {
            is_valid = false;
        }

        // Check description
        if (!$("#publish-description").is(":valid")) {
            is_valid = false;
        }

        // Check author
        if (!$("#publish-author").is(":valid")) {
            is_valid = false;
        }

        // Check quality
        if (!$("#publish-quality").is(":valid")) {
            is_valid = false;
        }

        return is_valid;
    }

    /**
     * Clean the notebook repo state so it can be refreshed
     */
    function clean_nb_state() {
        // Clean the variables
        GenePattern.repo.public_notebooks = [];
        GenePattern.repo.my_nb_paths = [];

        // Clean the UI
        $(".repository .list_item").remove();
        $("#notebook_list").find(".repo-publish-icon").remove();
    }

    function forceHTTPS(url) {
        if (window.location.protocol === "https:") return url.replace("http://", "https://");
        else return url;
    }

    function force_user_path(url) {
        return "/user/" + GenePattern.repo.username.toLowerCase() + url;
    }

    /**
     * Preview the selected notebook
     *
     * @param notebook
     */
    function preview_notebook(notebook) {
        // Show the loading screen
        modal_loading_screen();

        const preview_url = GenePattern.repo.repo_url + "/notebooks/" + notebook['id'] + "/preview/";
        window.open(preview_url);
        close_modal();
    }

    /**
     * Copy a notebook from the repo to the user's current directory
     *
     * @param notebook
     * @param current_directory
     */
    function copy_notebook(notebook) {
        // Show the loading screen
        modal_loading_screen();

        lazily_create_project().then((project) => {
            // Call the repo service to publish the notebook
            let current_directory = 'legacy_project/';
            $.ajax({
                url: GenePattern.repo.repo_url + "/notebooks/" + notebook['id'] + "/copy/" + current_directory,
                method: "POST",
                crossDomain: true,
                beforeSend: function (xhr) {
                    xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
                },
                success: function(responseData) {
                    // Close the modal
                    close_modal();

                    // Parse the data
                    const response = JSON.parse(responseData);

                    // Launch the legacy project
                    open_project(project, (project) => {
                        const get_url = project.data('get');
                        window.open(get_url + '/notebooks/' + response['filename']);
                        project.removeClass('nb-stopped');
                    });
                },
                error: function() {
                    // Close the modal
                    close_modal();

                    // Show error dialog
                    console.log("ERROR: Failed to copy from repository");
                    $("<div></div>")
                        .addClass("alert alert-danger")
                        .append("The GenePattern Notebook Repository encountered an error when attempting to copy the notebook.")
                        .prependTo("#repository-container");
                }
            });
        });
    }

    function lazily_create_project() {
        return new Promise((resolve, reject) => {
            // Does the legacy project exist?
            const project = $(`div.nb-project[data-api="/hub/api/users/${GenePattern.repo.username}/servers/legacy_project"]`);
            if (project.length) {
                resolve(project);
                return;
            }

            // Otherwise, lazily create the legacy project
            const api_url = `/hub/api/users/${GenePattern.repo.username}/servers/`;
            const safe_name = 'legacy_project';
            const project_name = 'Default Project';
            const image = 'Legacy';
            const description = 'A default project for running and reproducing public notebooks.';

            $.ajax({
                method: 'POST',
                url: api_url + safe_name,
                contentType: 'application/json',
                data: JSON.stringify({
                    "name": project_name,
                    "image": image,
                    "description": description
                }),
                success: () => {
                    resolve($('<div></div>')
                        .data('get', `/user/${GenePattern.repo.username}/legacy_project`));
                },
                error: () => {
                    $('#repository-container').prepend($('<div class="alert alert-danger">Unable to create project.</div>'));
                    reject();
                }
            });
        });
    }

    /**
     * Removes the notebook from the repository
     *
     * @param notebook
     */
    function remove_notebook(notebook) {
        // Show the loading screen
        modal_loading_screen();

        // Call the repo service to publish the notebook
        $.ajax({
            url: forceHTTPS(notebook['url']),
            method: "DELETE",
            crossDomain: true,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: function() {
                // Close the modal
                close_modal();

                // Refresh the list of notebooks
                clean_nb_state();
                get_notebooks(function() {
                    // Trigger a UI refresh
                    $([Jupyter.events]).trigger('draw_notebook_list.NotebookList');
                });

                // Display a success dialog
                dialog.modal({
                    title : "Notebook Unpublished from Repository",
                    body : $("<div></div>")
                        .addClass("alert alert-success")
                        .append("Your notebook was successfully removed from the GenePattern Notebook Repository."),
                    buttons: {"OK": function() {}}
                });
            },
            error: function() {
                // Close the modal
                close_modal();

                // Show error dialog
                console.log("ERROR: Failed to unpublish notebook in repository");
                dialog.modal({
                    title : "Failed to Unpublish Notebook",
                    body : $("<div></div>")
                        .addClass("alert alert-danger")
                        .append("The GenePattern Notebook Repository encountered an error when attempting to unpublish the notebook."),
                    buttons: {"OK": function() {}}
                });
            }
        });
    }

    /////////////////////////////////
    // BEGIN SHARING FUNCTIONALITY //
    /////////////////////////////////

    function run_shared_notebook(notebook, current_directory, custom_success, custom_error) {

    }

    function update_invite(notebook, accepted=true) { }

    function remove_shared_notebook(notebook) {
        // Show the loading screen
        modal_loading_screen();

        // Call the repo service to publish the notebook
        $.ajax({
            url: GenePattern.repo.repo_url + "/sharing/" + notebook['id'] + "/remove/",
            method: "DELETE",
            crossDomain: true,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: function(responseData) {
                // Close the modal
                close_modal();

                // Refresh the list of notebooks
                get_sharing_list(function() {
                    $("#refresh_notebook_list").trigger("click");
                    $("a[data-tag='-shared-by-me']").click();
                });

                // Open the dialog
                dialog.modal({
                    title : "Notebook is Now Private",
                    body : $("<div></div>")
                        .addClass("alert alert-success")
                        .append("The selected notebook is now private. Collaborators with existing copies " +
                            "of the notebook will retain their copies, but will no longer see changes you make."),
                    buttons: {
                        "OK": function() {}
                    }
                });

            },
            error: function() {
                // Close the modal
                close_modal();

                // Show error dialog
                console.log("ERROR: Failed to make the notebook private.");
                dialog.modal({
                    title : "Failed to Make Notebook Private",
                    body : $("<div></div>")
                        .addClass("alert alert-danger")
                        .append("The GenePattern Notebook Repository encountered an error when attempting to make the notebook private."),
                    buttons: {"OK": function() {}}
                });
            }
        });
    }

    /**
     * Show the dialog to run a shared notebook
     *
     * @param notebook
     */
    function repo_shared_dialog(notebook, invite_dialog=false) {
    }

    function decode_username(username) {
        return decodeURIComponent(username.replace(/-/g, '%'));
    }

    function get_shared_notebook(id_or_path) {
        let selected = null;
        GenePattern.repo.shared_notebooks.forEach(function(nb) {
            if (nb.id === id_or_path || nb.my_path === id_or_path) {
                selected = nb;
                return false;
            }
        });
        return selected;
    }

    function get_shared_owner(notebook) {
        let owner = null;
        notebook.collaborators.forEach(function(c) {
            if (c.owner) owner = c.user;
        });

        return owner;
    }

    function get_collaborator_string(notebook) {
        let collaborators = [];
        notebook.collaborators.forEach(function(c) {
            collaborators.push(c.user);
        });
        return collaborators.join(', ');
    }

    /**
     * Add the sharing icons to the user's notebooks
     */
    function add_sharing_icons() {
    }

    function shared_notebook_matrix(mine=true) {
        const notebooks = GenePattern.repo.shared_notebooks;
        const rows = [];

        notebooks.forEach(function(nb) {
            // Skip notebooks with other owners if mine is set
            if (mine && !nb.owner) return true;

            // Skip notebooks where user is the owner is mine is not set
            if (!mine && nb.owner) return true;

            // Prepare the last updated date
            let last_updated = null;
            if (nb.last_updated) last_updated = nb.last_updated.split(' ')[0];

            // Prepare the collaborator list
            let owner = get_shared_owner(nb);
            let collaborators = get_collaborator_string(nb);

            rows.push([nb.id, nb.name, collaborators, last_updated, owner, nb.accepted]);
        });

        return rows;
    }

    function build_sharing_table(tab, notebooks, shared_by_me) {
        const tab_node = $(`#${tab}`);

        // Create the table
        const list_div = tab_node.find(".repository-list");

        const table = $("<table></table>")
            .addClass("table table-striped table-bordered table-hover")
            .appendTo(list_div);

        // Initialize the DataTable
        const dt = table.DataTable({
            "oLanguage": {
                "sEmptyTable": (shared_by_me ? "You haven't shared any notebooks." : "No one has shared any notebooks with you.")
            },
            "data": notebooks,
            "autoWidth": false,
            "paging":  false,
            "columns": [
                {"title": "ID", "visible": false, "searchable": false},
                {
                    "title": "Notebook",
                    "width": "50%",
                    "visible": true,
                    "render": function(data, type, row, meta) {
                        return "<h4 class='repo-title'>" + row[1] + (!row[5] ? " <span class='label label-primary'>New!</span>" : "") + "</h4>";
                    }
                },
                {"title": "Collaborators", "width": "200px", "visible": true},
                {"title":"Updated", "width": "100px"},
                {"title":"Owner", "width": "100px"}
            ]
        });
        dt.order([4, 'desc']).draw();

        // Add event listener for notebook dialogs
        table.find("tbody").on('click', 'tr', function () {
            const data = dt.row( this ).data();
            const id = data[0];
            const nb = get_shared_notebook(id);
            const invite_dialog = !nb.accepted;

            // Attach the right dialog
            repo_shared_dialog(nb, invite_dialog);
        });
    }

    /**
     * Function builds a path list from the public notebooks
     */
    function share_path_list() {
        GenePattern.repo.my_shared_paths = [];
        GenePattern.repo.other_shared_paths = [];

        GenePattern.repo.shared_notebooks.forEach(function(nb) {
            if (nb['owner']) {
                GenePattern.repo.my_shared_paths.push('/notebooks/' + nb['my_path']);
            }
            else {
                if (nb['my_path']) GenePattern.repo.other_shared_paths.push('/notebooks/' + nb['my_path']);
            }
        });
    }

    function get_sharing_list(success = ()=>{}, error = ()=>{}) {
        $.ajax({
            url: GenePattern.repo.repo_url + "/sharing/list/",
            method: "GET",
            crossDomain: true,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: function(data) {
                GenePattern.repo.shared_notebooks = JSON.parse(data);
                share_path_list();
                update_sharing_notifications();
                success(data);
            },
            error: error
        });
    }

    function update_sharing_notifications() {
        const badge = $(".repo-notifications");
        const notebooks = GenePattern.repo.shared_notebooks;
        let count = 0;

        notebooks.forEach(function(nb) {
            // Skip accepted or non-accepted
            if (!nb.accepted && !nb.owner) count++;
        });

        // Hide no if invites pending
        if (count === 0) badge.text('');

        // Otherwise, set the notification number
        else badge.text(count);
    }

    function update_sharing(path, share_list, success, errors) {
        $.ajax({
            url: GenePattern.repo.repo_url + "/sharing/begin/",
            method: "POST",
            crossDomain: true,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: success,
            error: errors,
            data: {
                "notebook": path,
                "share_with": share_list.join(','),
                "shared_by": GenePattern.repo.username
            }
        });
    }

    /**
     * Displays an error message in a currently displayed dialog
     */
    function show_error_in_dialog(message) {
       $(".modal-dialog").find(".alert")
           .removeClass("alert-info")
           .addClass("alert-danger")
           .text(message)
    }

    function shared_user_error(user) {
        $(".repo-shared-user[title='" + user + "']").addClass("repo-shared-user-error");
    }

    /**
     * Function to call when the file list selection has changed
     */
    function selection_changed() {
        const selected = [];
        let has_directory = false;
        let has_file = false;
        let shared_with_me = false;
        let checked = 0;
        $('.list_item :checked').each(function(index, item) {
            const parent = $(item).parent().parent();

            // If the item doesn't have an upload button, isn't the
            // breadcrumbs and isn't the parent folder '..', then it can be selected.
            // Breadcrumbs path == ''.
            if (parent.find('.upload_button').length === 0 && parent.data('path') !== '') {
                checked++;
                selected.push({
                    name: parent.data('name'),
                    path: parent.data('path'),
                    type: parent.data('type')
                });

                // Set flags according to what is selected.  Flags are later
                // used to decide which action buttons are visible.
                has_file = has_file || (parent.data('type') === 'file');
                has_directory = has_directory || (parent.data('type') === 'directory');
                shared_with_me = shared_with_me || parent.find(".repo-shared-with").length;
            }
        });

        // Sharing isn't visible when a directory or file is selected.
        // To allow sharing multiple notebooks at once: selected.length > 0 && !has_directory && !has_file
        if (selected.length === 1 && !has_directory && !has_file && !shared_with_me) {
            $('.publish-button, .share-button').css('display', 'inline-block');
        }
        else {
            $('.publish-button, .share-button').css('display', 'none');
        }
    }

    /**
     * Function builds a path list from the public notebooks
     */
    function nb_path_list() {
        GenePattern.repo.my_nb_paths = [];
        GenePattern.repo.public_notebooks.forEach(function(nb) {
            if (nb['owner'] === GenePattern.repo.username) {
                GenePattern.repo.my_nb_paths.push(nb['api_path']);
            }
        });
    }

    /**
     * Construct the URL for the notebook's containing directory
     *
     * @param notebook
     * @returns {string|null}
     */
    function build_dir_url(notebook) {
        const base_path = notebook['my_path'] ? notebook['my_path'] : notebook['api_path'];

        return base_path.match(/^(.*[\\\/])/)[1].replace("/notebooks/", "/tree/", 1);
    }

    /**
     * Converts a Jupyter API path to a file path relative to the user's home directory
     *
     * @param api_path
     * @returns {string}
     */
    function home_relative_path(api_path) {
        // Decode %20 or similar encodings
        api_path = decodeURI(api_path);

        // Get the base URL
        const base_url = Jupyter.notebook_list ? Jupyter.notebook_list.base_url.length-1 : Jupyter.notebook.base_url.length-1;

        // Removes /users/foo/ if it's prepended to the path
        const standardized_url = api_path.substring(base_url);

        // Handle notebook URLs
        if (standardized_url.startsWith("/notebooks/")) return standardized_url.substring(11);

        // Handle directory URLs
        if (standardized_url.startsWith("/tree/")) return standardized_url.substring(6);

        // Otherwise, take our best guess
        return standardized_url.substring(standardized_url.split('/')[1].length+2);
    }

    /**
     * Show a dialog with details about the notebook
     *
     * @param notebook
     */
    function repo_nb_dialog(notebook) {
        // Sanitize the title
        let title = notebook['name'];
        if (title.length > 32) {
            title = title.substring(0,32) + "..."
        }

        // Build the body
        const body = $("<div></div>")
            .append(
                $("<div></div>")
                    .addClass("repo-dialog-labels")
                    .append("Authors")
                    .append($("<br/>"))
                    .append("Quality")
                    .append($("<br/>"))
                    .append("Filename")
                    .append($("<br/>"))
                    .append("Owner")
                    .append($("<br/>"))
                    .append("Updated")
            )
            .append(
                $("<div></div>")
                    .addClass("repo-dialog-values")
                    .append(notebook['author'])
                    .append($("<br/>"))
                    .append(notebook['quality'])
                    .append($("<br/>"))
                    .append(notebook['file_path'].replace(/^.*[\\\/]/, ''))
                    .append($("<br/>"))
                    .append(decode_username(notebook['owner']))
                    .append($("<br/>"))
                    .append(notebook['publication'])
            )
            .append(
                $("<div></div>")
                    .addClass("repo-dialog-description")
                    .append(notebook['description'])
            );

        // Show the modal dialog
        let modal_frame = $(`
        <div class="modal fade"tabindex="-1" role="dialog" aria-labelledby="frame-project-label" aria-hidden="true">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">×</span><span class="sr-only">Close</span></button>
                <h4 class="modal-title">${title}</h4>
              </div>
              <div class="modal-body"></div>
              <div class="modal-footer">
                <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-default preview" data-dismiss="modal">Preview</button>
                <button type="button" class="btn btn-primary run" data-dismiss="modal">Run Notebook</button>
              </div>
            </div>
          </div>
        </div>`);
        modal_frame.find('.modal-body').append(body);
        modal_frame.find('.preview').click(() => {
            preview_notebook(notebook);
        });
        modal_frame.find('.run').click(() => {
            copy_notebook(notebook);
        });
        $('body').append(modal_frame);
        modal_frame.modal();
    }

    /**
     * Transform a list of tag objects into a list of tag strings
     *
     * @param nb
     */
    function build_tag_list(nb) {
        // If cached, return
        if (nb.str_tags) return nb.str_tags;

        // Otherwise generate
        let to_return = [];

        nb.tags.forEach(function(tag) {
            to_return.push(tag.label);
        });

        nb.str_tags = to_return;
        return to_return;
    }

    function is_owner(notebook) {
        return notebook.owner === GenePattern.repo.username;
    }

    /**
     * Transforms the JSON notebooks object into a list of lists,
     * to be consumed by data tables
     */
    function public_notebook_list(tag, must_include_tags=[], cannot_include_tags=[]) {
        const built_list = [];

        GenePattern.repo.public_notebooks.forEach(function(nb) {
            const tags = build_tag_list(nb);

            // Return if a required tag isn't included
            let should_return = false;
            must_include_tags.forEach(function(tag) {
                if (!tags.includes(tag)) should_return = true;
            });
            if (should_return) return true;

            // Return if a forbidden tag is included
            cannot_include_tags.forEach(function(tag) {
                if (tags.includes(tag)) should_return = true;
            });
            if (should_return) return true;

            // If tag is -my-notebooks, return public notebooks you own
            if (tag === '-my-notebooks' && is_owner(nb)) built_list.push([nb.id, nb.name, nb.description, nb.author, nb.publication, nb.quality, tags]);

            // If -prerelease, return all notebooks without a pinned tag
            else if (tag === '-prerelease' && no_pinned_tags(tags)) built_list.push([nb.id, nb.name, nb.description, nb.author, nb.publication, nb.quality, tags]);

            // If -all, return all
            else if (tag === '-all') built_list.push([nb.id, nb.name, nb.description, nb.author, nb.publication, nb.quality, tags]);

            // Otherwise, check for a matching tag
            else if (tags.includes(tag)) built_list.push([nb.id, nb.name, nb.description, nb.author, nb.publication, nb.quality, tags]);
        });

        return built_list;
    }

    /**
     * Returns true if the list of tags contains no pinned tags
     *
     * @param tags
     * @returns {boolean}
     */
    function no_pinned_tags(tags) {
        const pinned_tags = new Set(get_pinned_tags('workshops').concat(get_pinned_tags('repository')));
        let intersection = new Set([...tags].filter(x => pinned_tags.has(x)));
        return intersection.size === 0;
    }

    /**
     * Return the notebook matching the provided ID
     * @param id
     * @returns {*}
     */
    function get_notebook(id) {
        let selected = null;
        GenePattern.repo.public_notebooks.forEach(function(nb) {
            if (nb.id === id) {
                selected = nb;
                return false;
            }
        });
        return selected;
    }

    /**
     * Builds the repository tab
     */
    function build_repo_tab(tab, sidebar, full_sidebar, must_include_tags, cannot_include_tags) {
        // Add Notebook Sidebar
        const tab_node = $(`#${tab}`);

        const pinned_tags = get_pinned_tags($(sidebar).attr("title"), must_include_tags, cannot_include_tags);
        const nav = tab_node.find(sidebar);

        // Remember which nav was selected
        const remembered = nav.parent().find("li.active").text();

        // Empty the sidebar when refreshing the list
        nav.empty();

        // Add the all notebooks tag
        if (full_sidebar) nav.append(create_sidebar_nav(tab, 'featured', 'featured', [], []));

        // For each pinned tag, add to the sidebar
        pinned_tags.forEach(function(tag) {
            if (tag === 'featured') return; // Skip the featured tag, as it's handled as a special case above
            const tag_model = get_tag_model(tag);
            nav.append(create_sidebar_nav(tab, tag_model, tag, must_include_tags, cannot_include_tags));
        });

        // Add the prerelease tag
        if (full_sidebar) nav.append(create_sidebar_nav(tab, '-prerelease', 'prerelease', must_include_tags, cannot_include_tags));

        // Add the all notebooks tag
        if (full_sidebar) nav.append(create_sidebar_nav(tab, '-all', 'all notebooks', [], []));
    }

    function get_protected_tags() {
        // If already cached, return the list
        if (GenePattern.repo.protected_tags) return GenePattern.repo.protected_tags;

        // Otherwise, generate the list
        const protected_tags = [];
        GenePattern.repo.public_notebooks.forEach(function(nb) {
            if (nb.tags) {
                nb.tags.forEach(function(tag) {
                    // If the tag is protected and not already in the list
                    if (tag.protected && !protected_tags.includes(tag.label)) {
                        protected_tags.push(tag.label);
                    }
                });
            }
        });
        protected_tags.sort();

        // Set the cache and return
        GenePattern.repo.protected_tags = protected_tags;
        return protected_tags;
    }

    function get_pinned_tags(collection, must_include_tags=[], cannot_include_tags=[]) {
        // If already cached, return the list
        if (GenePattern.repo.pinned_tags && GenePattern.repo.pinned_tags[collection]) {
            return GenePattern.repo.pinned_tags[collection];
        }

        // Otherwise, generate the list
        const pinned_tags = [];
        GenePattern.repo.public_notebooks.forEach(function(nb) {
            if (nb.tags) {
                // Assemble all tags in a list
                const nb_tags = [];
                nb.tags.forEach(function(tag) {
                    nb_tags.push(tag.label);
                });

                // If notebook doesn't have required tag, return
                let should_return = false;
                must_include_tags.forEach(function(tag) {
                    if (!nb_tags.includes(tag)) should_return = true;
                });
                if (should_return) return true;

                // If notebook has forbidden tag, return
                cannot_include_tags.forEach(function(tag) {
                    if (nb_tags.includes(tag)) should_return = true;
                });
                if (should_return) return true;

                nb.tags.forEach(function(tag) {
                    // If the tag is pinned and not already in the list
                    if (tag.pinned && !pinned_tags.includes(tag.label)) {
                        pinned_tags.push(tag.label);
                    }
                });
            }
        });
        pinned_tags.sort();

        // Set the cache and return
        if (!GenePattern.repo.pinned_tags) GenePattern.repo.pinned_tags = {};
        GenePattern.repo.pinned_tags[collection] = pinned_tags;
        return pinned_tags;
    }

    function get_tag_model(tag_label) {
        // If already cached, return the model
        if (GenePattern.repo.tag_models) return GenePattern.repo.tag_models[tag_label];

        // Otherwise, generate the map
        const tag_models = {};
        GenePattern.repo.public_notebooks.forEach(function(nb) {
            if (nb.tags) {
                nb.tags.forEach(function(tag) {
                    tag_models[tag.label] = tag;
                });
            }
        });

        // Set the cache and return
        GenePattern.repo.tag_models = tag_models;
        return tag_models[tag_label];
    }

    function select_sidebar_nav(tab, link, must_include_tags=[], cannot_include_tags=[]) {
        const tab_node = $(`#${tab}`);

        // Remove the old active class
        const nav = tab_node.find(".repo-sidebar");
        nav.find("li").removeClass("active");

        // Add the new active class
        link.parent().addClass("active");

        // Clear the search box, unless all notebooks
        if (!link.hasClass('repo-all-notebooks')) tab_node.find(".repository-search > input").val('');

        // Set the header label
        tab_node.find(".repo-header-label").html(link.html());

        // Remove the old notebook table
        tab_node.find(".repository-list").empty();

        // Get the data tag
        const tag = link.attr("data-tag");
        const nb_header = tab_node.find(".repo-header-notebooks");

        // If public notebook
        if (tag === '-all' || tag.endsWith('notebooks')) nb_header.hide();
        else nb_header.show();
        const filtered_notebook_list = public_notebook_list(link.attr("data-tag"), must_include_tags, ["workshop"]);
        const filtered_workshop_list = public_notebook_list(link.attr("data-tag"), ["workshop"], cannot_include_tags);

        build_notebook_table(tab, tag, filtered_notebook_list, false);
        build_notebook_table(tab, tag, filtered_workshop_list, true);
    }

    function create_sidebar_nav(tab, tag, label, must_include_tags=[], cannot_include_tags=[]) {
        let tag_label = tag;
        if (typeof tag === "object") tag_label = tag.label;
        const li = $('<li role="presentation"></li>');
        const link = $('<a href="#repository" data-tag="' + tag_label + '">' + label + '</a>');
        if (tag.description) link.data("description", tag.description);
        if (tag_label === '-shared-with-me') link.append($('<span class="badge repo-notifications" title="New Sharing Invites"></span>'));
        else if (tag_label === '-all') link.addClass('repo-all-notebooks');

        // Attach the click event
        link.click(function() {
            select_sidebar_nav(tab, link, must_include_tags, cannot_include_tags);
        });

        // Assemble the elements and return
        li.append(link);
        return li;
    }

    /**
     * Build and attach a notebook DataTable to the Public Notebooks tab
     *
     * @param tab
     * @param label
     * @param notebooks
     * @param workshop
     */
    function build_notebook_table(tab, label, notebooks, workshop) {
        const tab_node = $(`#${tab}`);

        // Create the table
        const list_div = tab_node.find(".repository-list");

        // Do not display workshop notebooks when empty
        if (workshop && notebooks.length === 0) return;

        // Do not display public notebooks when label is workshop
        if (label === 'workshop' && !workshop) return;

        // Add the header, if one is defined
        if (workshop) {
            if (label !== 'workshop') $("<hr/>").appendTo(list_div);
            if (label !== 'workshop') $("<h4></h4>").text("Workshop Notebooks").appendTo(list_div);
            $("<label></label>").text("Workshop notebooks are companion notebooks for GenePattern workshops, intended to teach concepts or new features.").appendTo(list_div);
        }

        // Create the tag description
        const description = tab_node.find("ul.repo-sidebar-nav").find("li.active > a").data("description");
        if (description && !workshop) $("<p></p>").addClass("repo-tag-description").html(description).appendTo(list_div);

        const table = $("<table></table>")
            .addClass("table table-striped table-bordered table-hover")
            .appendTo(list_div);

        // Initialize the DataTable
        const dt = table.DataTable({
            "oLanguage": {
                "sEmptyTable": "No public notebooks are in the library."
            },
            "data": notebooks,
            "autoWidth": false,
            "paging":  false,
            "columns": [
                {"title": "ID", "visible": false, "searchable": false},
                {
                    "title": "Notebook",
                    "width": "50%",
                    "visible": true,
                    "render": function(data, type, row, meta) {
                        let to_return = "<h4 class='repo-title'>" + row[1] + "</h4>" +
                                          "<div class='repo-description'>" + row[2] + "</div>" +
                                          "<div>";

                        // Add tags
                        row[6].forEach(function(tag) {
                            to_return += "<span class='label label-primary'>" + tag + "</span> ";
                        });

                        to_return += "</div>";
                        return to_return;
                    }
                },
                {"title": "Description", "visible": false},
                {"title": "Authors", "width": "200px", "visible": true},
                {"title":"Updated", "width": "100px"},
                {"title":"Quality", "width": "100px"}
            ]
        });
        dt.order([4, 'desc']).draw();

        // Add event listener for notebook dialogs
        table.find("tbody").on('click', 'tr', function () {
            const data = dt.row( this ).data();
            const id = data[0];
            const nb = get_notebook(id);
            repo_nb_dialog(nb);
        });

        // Add event listener for tag clicks
        table.find("td").on('click', '.label', function (event) {
            const tag = $(event.target).text();

            // If admin, give choice to pin or protect tag
            if (GenePattern.repo.admin) {
                admin_tag_dialog(tab, tag);
            }
            else {
                // Filter the table by this tag
                const search_box = tab_node.find(".repository-search").find("input[type=search]");
                search_box.val(tag);
                search_box.keyup();
            }

            // Stop propagation
            return false;
        });
    }

    /**
     * Updates the tag model on the server
     *
     * @param model
     */
    function update_tag(model) {
        $.ajax({
            url: GenePattern.repo.repo_url + "/tags/" + model.id + "/",
            method: "PUT",
            crossDomain: true,
            data: model,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: function(response) {
                get_notebooks(function() {});
            },
            error: function() {
                console.log("ERROR: Could not update tag model");
            }
        });
    }

    /**
     * Prompt the admin to pin or protect tag
     *
     * @param tag
     */
    function admin_tag_dialog(tab, tag) {
        const pinned_tags = get_pinned_tags(tab);
        const protected_tags = get_protected_tags();

        let is_pinned = pinned_tags.includes(tag);
        let is_protected = protected_tags.includes(tag);

        // Prepare buttons
        const buttons = {};
        buttons[is_pinned ? "Unpin" : "Pin"] = {
            "class": is_pinned ? "btn-danger" : "btn-warning",
            "click": function() {
                const tag_model = get_tag_model(tag);
                tag_model.pinned = !tag_model.pinned;
                update_tag(tag_model);
            }
        };
        buttons[is_protected ? "Unprotect" : "Protect"] = {
            "class": is_protected ? "btn-danger" : "btn-warning",
            "click": function() {
                const tag_model = get_tag_model(tag);
                tag_model.protected = !tag_model.protected;
                update_tag(tag_model);
            }
        };
        buttons["Cancel"] = function() {};

        dialog.modal({
            title : "Pin or Protect Tag",
            body : $("<div></div>")
                .addClass("alert alert-info")
                .append("Pin or protect the following tag: <span class='label label-primary'>" + tag + "</span>"),
            buttons: buttons
        });
    }

    /**
     * Initialize the periodic refresh of the notebook repository tab
     */
    function init_repo_refresh() {
        // When the repository tab is clicked
        $(".repository_tab_link").click(function() {
            const ONE_MINUTE = 60000;

            // If the notebooks haven't been refreshed in the last minute, refresh
            if (GenePattern.repo.last_refresh < new Date().valueOf() - ONE_MINUTE) {
                get_notebooks(function() {});
            }
        });
    }

    /**
     * Empty all notebook UI elements from the list
     */
    function empty_notebook_list() {
        $(".repository-list").empty();
        GenePattern.repo.pinned_tags = null;
        GenePattern.repo.protected_tags = null;
        GenePattern.repo.tag_models = null;
    }

    /**
     * Get the list of notebooks
     *
     * @param success_callback
     */
    function get_notebooks(success_callback) {
        $.ajax({
            url: GenePattern.repo.repo_url + "/notebooks/",
            method: "GET",
            crossDomain: true,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: function(response) {
                GenePattern.repo.public_notebooks = response['results'];
                nb_path_list(); // Build the path list for displaying publish icons

                // If viewing the notebook index
                empty_notebook_list(); // Empty the list of any existing state
                const selected_tag = $('.repo-sidebar').find("li.active").text();
                build_repo_tab('repository', ".repo-sidebar-nav", true, [], []); // Populate the repository tab
                select_remembered_tag('repository', selected_tag);

                GenePattern.repo.last_refresh = new Date(); // Set the time of last refresh
                if (success_callback) success_callback();
            },
            error: function() {
                console.log("ERROR: Could not obtain list of public notebooks");
            }
        });
    }

    function select_remembered_tag(tab, tag) {
        // Get the remembered tag's li
        const sidebar = $('.repo-sidebar');
        let to_select = sidebar.find(`li:contains('${tag}')`);

        // If no remembered tag or no li found, select the featured tag
        if (!to_select.length || !tag) to_select = sidebar.find("li:contains('featured')");

        // If featured wasn't found, select first li
        if (!to_select.length) to_select = sidebar.find("li:first");

        select_sidebar_nav(tab, to_select.find('a'));
    }

    /**
     * Reads the cookie string and returns a resulting map
     *
     * @returns {object}
     */
    function cookie_to_map() {
        const cookie_map = {};

        document.cookie.split(';').forEach(function(cookie_str) {
            const pair = cookie_str.split('=');
            const key = pair[0].trim();
            cookie_map[key] = pair.length > 1 ? pair[1].trim() : '';
        });

        return cookie_map;
    }

    function normalize_username(username) {
        return encodeURIComponent(username.toLowerCase())
            .replaceAll('.', '%2e')
            .replaceAll('-', '%2d')
            .replaceAll('~', '%7e')
            .replaceAll('_', '%5f')
            .replaceAll('%', '-');
    }

    /**
     * Gets the username from a variety of possible sources
     *
     * @returns {string}
     */
    function extract_username() {
        let extracted_username = username || null;

        // Try to get username from GPNB cookie
        const cookie_map = cookie_to_map();
        if (extracted_username === null &&
            cookie_map['gpnb-username'] !== undefined &&
            cookie_map['gpnb-username'] !== null &&
            cookie_map['gpnb-username'] !== 'undefined' &&
            cookie_map['gpnb-username'] !== 'null') {
            extracted_username = cookie_map['gpnb-username'];
        }

        // Try the GenePattern token
        if (cookie_map['GenePattern'] !== undefined &&
            cookie_map['GenePattern'] !== null &&
            cookie_map['GenePattern'] !== 'undefined' &&
            cookie_map['GenePattern'] !== 'null') {
            extracted_username = normalize_username(cookie_map['GenePattern'].split('|')[0]);
        }

        // Try to get username from JupyterHub cookie
        if (extracted_username === null) {
            $.each(cookie_map, function(i) {
                if (i.startsWith("jupyter-hub-token-")) {
                    extracted_username = decodeURIComponent(i.match(/^jupyter-hub-token-(.*)/)[1]);
                }
            });
        }

        // Try to get the username from the URL
        if (extracted_username === null) {
            const url_parts = window.location.href.split('/');
            if (url_parts.length >= 5 &&
                url_parts[0] === window.location.protocol &&
                url_parts[1] === '' &&
                url_parts[2] === window.location.host &&
                url_parts[3] === 'user') {
                extracted_username = decodeURI(url_parts[4])
            }
        }

        // If all else fails, prompt the user
        if (extracted_username === null) {
            extracted_username = prompt("What is your username?", "");
        }

        // Set a GPNB cookie
        document.cookie = 'gpnb-username' + '=' + extracted_username;

        return extracted_username;
    }

    function show_repo() {
        $(".repository_tab_link").show();
    }

    function hide_repo() {
        $(".publish-button, .share-button").remove();
        $(".publish-option, .share-option").hide();
        $(".repository_tab_link").hide();
    }

    /**
     * Authenticate with the GPNB Repo
     *
     * @param success_callback
     */
    function do_authentication(success_callback) {
        // Set top-level variables
        const standard_ports = window.location.port === '443' || window.location.port === '80' || window.location.port === '';
        GenePattern.repo.repo_url = window.location.protocol + '//' + window.location.hostname + (standard_ports ? '' : ':8080') + '/services/sharing';
        GenePattern.repo.username = extract_username();

        $.ajax({
            url: GenePattern.repo.repo_url + "/api-token-auth/",
            method: "POST",
            data: {
                'username': GenePattern.repo.username,
                'password': 'FROM_AUTHENTICATOR'
            },
            crossDomain: true,
            success: function(data) {
                // Show the repo UI elements
                show_repo();

                // Set token and make callback
                GenePattern.repo.token = data['token'];
                GenePattern.repo.admin = data['admin'];
                if (success_callback) success_callback();

                // Trigger the custom event
                $(document).trigger("gp.repo.auth");
            },
            error: function() {
                console.log("ERROR: Could not authenticate with GenePattern Notebook Repository.");

                // Hide repo UI elements
                hide_repo();
            }
        });
    }

    /**
     * Initialize the repo tab and search box
     */
    function init_repo_tab(id, name) {
        // Add the contents of the public notebooks tab
        $("#repository-container")
            .append(
                $(`<div id="${id}" class="repository tab-pane row"></div>`)
                    .append(
                        $("<div class='repo-sidebar col-md-2'></div>")
                            .append($("<h4>Public Notebooks</h4>"))
                            .append($("<ul class='repo-sidebar-nav nav nav-pills' title='repository'></ul>"))
                    )
                    .append(
                        $('<div class="list_container col-md-10">')
                            .append(
                                $('<div class="repository-search"></div>')
                                    .append(
                                        $('<input />')
                                            .attr("type", "search")
                                            .attr('placeholder', 'Search Library')
                                            .addClass('form-control')
                                            .keyup(function(event) {
                                                const tab_node = $(`#${id}`);

                                                // If all notebooks is not selected, select it
                                                if (!is_all_nb_selected(id)) tab_node.find(".repo-all-notebooks").click();

                                                const search_text = strip_special_characters($(event.target).val());
                                                const filter_input = tab_node.find(".repository-list input[type=search]");
                                                filter_input.val(search_text).keyup();
                                            })
                                    )
                            )
                            .append(
                                $('<div class="repository-list-header row list_header repo-header"></div>')
                                    .append("<span class='repo-header-label'></span> <span class='repo-header-notebooks'>Notebooks</span>")
                            )
                            .append(
                                $('<div class="repository-list row"></div>')
                            )
                    )
                    .ready(function() {
                        // Display the Public Notebooks tab, if selected
                        if (window.location.hash === "#repository") {
                            setTimeout(function() {
                                $(".repository_tab_link[name=repository]").tab('show');
                            }, 1);
                        }
                        else if (window.location.hash === "#workshops") {
                            setTimeout(function() {
                                $(".repository_tab_link[name=workshops]").tab('show');
                            }, 1);
                        }
                    })
            );
    }

    function is_all_nb_selected(tab) {
        const tab_node = $(`#${tab}`);
        return tab_node.find(".repo-all-notebooks").parent().hasClass('active');
    }

    function lock_notebook(user) {
        $("#notification_area").prepend(
            $("<div></div>")
                .attr("id", "notification_locked")
                .addClass("notification_widget btn btn-xs navbar-btn")
                .attr("title", "Notebook currently being edited by " + user)
                .append(
                    $("<span></span>")
                        .append('<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>')
                        .append(" Locked")
                )
                .click(function() {
                    dialog.modal({
                        title : "Notebook Locked",
                        body : $("<div></div>")
                            .addClass("alert alert-info")
                            .append("This shared notebook is currently being edited by " + user + ". Editing has been disabled. " +
                                "You will need to reload the page in order to pick up any changes."),
                        buttons: {"OK": function() {}}
                    });
                })
        );

        // Disable a bunch of stuff
        $("#save-notbook, #save-notebook").find("button").attr("disabled", "disabled");
        $("#save_checkpoint").addClass("disabled");
        $("#restore_checkpoint").addClass("disabled");
        $("#rename_notebook").addClass("disabled");

        Jupyter.notebook.writable = false;
        Jupyter.notebook.minimum_autosave_interval = 9999999999;

        const name_clone = $("#notebook_name").clone();
        $("#notebook_name").hide();
        $("#save_widget").prepend(name_clone);
    }
    GenePattern.repo.lock_notebook = lock_notebook;

    /**
     * Checks to see if multiple authentication widgets exist in this notebook
     *
     * @returns {boolean}
     */
    function multiple_auth_check() {
        return $(".gp-widget.gp-widget-auth").length > 1;
    }

    function job_widget_check() {
        return $(".gp-widget.gp-widget-job[name!='-1']").length > 0;
    }

    function displayed_code_check() {
        let errors = false;
        Jupyter.notebook.get_cells().forEach(function(cell) {
            if (cell.metadata.genepattern && $(cell.element).find(".input:visible").length > 0) {
                errors = true;
            }
        });
        return errors;
    }

    function unrendered_widget_check() {
        let errors = false;
        Jupyter.notebook.get_cells().forEach(function(cell) {
            if (cell.metadata.genepattern && $(cell.element).find(".gp-widget").length < 1) {
                errors = true;
            }
        });
        return errors;
    }

    // Validates a notebook for publication
    function validate_notebook() {
        const issues_found = [];

        // Check for multiple authentication widgets
        if (multiple_auth_check()) {
            issues_found.push("Multiple GenePattern authentication cells were detected. Most of the time this will be in error, however, this may be valid" +
                " if you are connecting to multiple GenePattern servers from the same notebook.");
        }

        // Check for non-placeholder job widgets
        if (job_widget_check()) {
            issues_found.push("A GenePattern job cell was detected in your notebook. Since GenePattern jobs are private to each user, this will likely" +
                " display as an error when other users view your notebook.");
        }

        // Check for displayed code
        if (displayed_code_check()) {
            issues_found.push("Code is currently toggled for display in one or more GenePattern cells. While this is not necessarily an error, it may" +
                " confuse unfamiliar users.");
        }

        // Check for unrendered widgets
        if (unrendered_widget_check()) {
            issues_found.push("There appears to be an error with the display of one or more GenePattern cells. The cause of this error could not be detected, but" +
                " to may be best to double check your notebook.");
        }

        if (issues_found.length < 1) {
            publish_selected();
        }
        else {
            const body = $("<div></div>")
                .addClass("alert alert-warning")
                .append(
                    $("<p></p>")
                        .append("When preparing your notebook for publication the following potential issues were discovered. " +
                            "Please correct them and publish again, or otherwise confirm that you want to publish your notebook as is.")
                )
                .append(
                    $("<ul></ul>")
                        .attr("id", "issues_list")
                        .css("margin-top", "10px")
                );
            issues_found.forEach(function(issue) {
                body.find("#issues_list").append(
                    $("<li></li>").append(issue)
                );
            });

            dialog.modal({
                title : "Potential Notebook Issues Found",
                body : body,
                buttons: {
                    "Fix Issues": function() {},
                    "Continue": {
                        "class": "btn-warning",
                        "click": function() {
                            publish_selected();
                        }
                    }
                }
            });
        }
    }

    function in_shared_notebook() {
        return GenePattern.repo.my_shared_paths.indexOf('/notebooks/' + Jupyter.notebook.notebook_path) > -1 ||
               GenePattern.repo.other_shared_paths.indexOf('/notebooks/' + Jupyter.notebook.notebook_path) > -1;
    }

    function init_save_sync() {
        // No need to sync if this is not a shared notebook
        if (!in_shared_notebook()) return;

        // Otherwise, sync the notebook after every save
        const events = require('base/js/events');
        events.on('notebook_saved.Notebook', function() {
            // Get the path to the current directory
            const slash_index = Jupyter.notebook.notebook_path.lastIndexOf('/');             // Get the last slash, separating directory from file name
            const directory_path = Jupyter.notebook.notebook_path.substring(0, slash_index); // Get the directory path

            // Get the current notebook's model
            const notebook = get_shared_notebook(Jupyter.notebook.notebook_path);

            run_shared_notebook(notebook, directory_path, () => {}, () => {});
        });
    }

    function open_editing_dialog() {
        dialog.modal({
            title : "Current Editors: " + GenePattern.repo.current_editors.join(', '),
            body : $("<div></div>")
                .append($("<div></div>")
                    .addClass("alert alert-warning")
                    .append("<p>One or more other collaborators are currently editing this notebook. Saving the notebook will overwrite any changes they make.</p>")
                ),
            buttons: {"OK": function() {}}
        });
    }

    function create_editing_notification() {
        // Create the notification
        const notification = $("<div></div>")
            .attr("id", "repo-editors")
            .addClass("label label-danger")
            .append("<span class='repo-editing-count'></span>")
            .append(" Other")
            .append("<span class='repo-editing-s'>s</span>")
            .append(" Editing")
            .hide()
            .click(() => open_editing_dialog());

        // Attach it to the toolbar
        $("#maintoolbar").prepend(notification);

        // Return the notification
        return notification;
    }

    function is_public_notebook() {
        return !!Jupyter.notebook.metadata &&
            !!Jupyter.notebook.metadata.genepattern &&
            !!Jupyter.notebook.metadata.genepattern.repository_url;
    }

    /**
     * Call the launched counter endpoint
     */
    function call_launched_endpoint() {
        $.ajax({
            url: forceHTTPS(Jupyter.notebook.metadata.genepattern.repository_url + "launched/"),
            method: "PUT",
            crossDomain: true,
            // beforeSend: function (xhr) {
            //     xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            // },
            success: () => console.log("Successfully incremented launch counter"),
            error: () => console.log("Error incrementing launch counter")
        });
    }

    function add_move_warning(nb) {
        // Get the path and notebook object, depending on whether one has been provided as an argument
        const nb_path = nb ? nb.api_path : get_selected_path();
        const published = is_nb_published(nb_path);
        const shared = !!get_shared_notebook(nb_path);

        // If not a published or shared notebook, do nothing
        if (!published && !shared) return;

        // Add the warning message
        setTimeout(function() {
            $(".modal-body").prepend(
                $("<div></div>")
                    .addClass("alert alert-danger")
                    .text("You are about to move or rename a shared notebook. Doing this may cause problems accessing the notebook from the Notebook Library.")
            );
        }, 200);
    }

    function rename_in_nb_warning() {
        // Get the notebook if public or shared
        let notebook = get_published(Jupyter.notebook.base_url + 'notebooks/' + encodeURI(Jupyter.notebook.notebook_path));
        notebook = !!notebook ? notebook : get_shared_notebook('/notebooks/' + encodeURI(Jupyter.notebook.notebook_path));

        // If not public or shared, do nothing
        if (!notebook) return;

        // Add the warning
        add_move_warning(notebook);
    }

    function tree_init() {
        // Mark repo events as initialized
        GenePattern.repo.events_init = true;

        // Init the data table search
        init_table_search();

        // Initialize notebook library and workshop tabs
        init_repo_tab("repository", "Notebook Library");

        // Authenticate and the list of public notebooks
        do_authentication(function () {
            get_notebooks(function () {
            });
            get_sharing_list(function () {
            });
        });

        // Refresh notebooks in the list if the tab is clicked
        init_repo_refresh();
    }

    function notebook_init() {
        /*
         * If we are currently viewing a notebook
         */
        if (Jupyter.notebook !== undefined) {
            // Handle public notebooks
            if (is_public_notebook()) {

                // Increment the launched counter
                call_launched_endpoint();

                // Add the comment button
                Jupyter.toolbar.add_buttons_group([{
                    'label'   : 'Comments',
                    'icon'    : 'fa-comments',
                    'id'    : 'genepattern-comments',
                    'callback': function() {
                        display_comment_dialog();
                    }
                }]);
            }

            // Authenticate
            do_authentication(function() {
                get_notebooks(function() {
                    // Add publish link to the toolbar
                    add_publish_link();

                    // Add the rename warning
                    $("#notebook_name").click(() => rename_in_nb_warning());
                });
                get_sharing_list(function() {
                    // Update the shared canonical copy upon save
                    init_save_sync();

                    // Notify the user when someone else is editing the notebook
                    collaborator_poll();
                });
            });
        }
    }

    return {
        tree_init: tree_init
    };
});
