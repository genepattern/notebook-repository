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

require(['base/js/namespace', 'jquery', 'base/js/dialog', 'repo/js/jquery.dataTables.min', 'repo/js/tag-it'], function(Jupyter, $, dialog, datatables, tagit) {
    "use strict";

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
        $("#repository").find(".list_item").remove();
        $("#notebook_list").find(".repo-publish-icon").remove();
    }

    function forceHTTPS(url) {
        // Ignore this directive if in development mode
        if (url.startsWith("http://localhost:")) return url;

        if (!url.startsWith("https://")) {
            return url.replace("http://", "https://")
        }
        else {
            return url;
        }
    }

    function force_user_path(url) {
        return "/user/" + GenePattern.repo.username.toLowerCase() + url;
    }

    /**
     * Send a notebook to the repo to publish or update it
     *
     * @param notebook
     * @param nb_path
     * @param published
     */
    function publish_or_update(notebook, nb_path, published) {
        // Get the notebook data structure
        const pub_nb = make_nb_json(notebook, nb_path);

        // Show the loading screen
        modal_loading_screen();

        // Call the repo service to publish the notebook
        $.ajax({
            url: (published ? forceHTTPS(notebook['url']) : GenePattern.repo.repo_url + "/notebooks/"),
            method: (published ? "PUT" : "POST"),
            crossDomain: true,
            data: pub_nb,
            dataType: 'json',
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
                    title : "Notebook Published to Repository",
                    body : $("<div></div>")
                        .addClass("alert alert-success")
                        .append(
                            (published ?
                                "Your notebook was successfully updated in the GenePattern Notebook Repository." :
                                "Your notebook was successfully published to the GenePattern Notebook Repository.")

                        ),
                    buttons: {"OK": function() {}}
                });
            },
            error: function() {
                // Close the modal
                close_modal();

                // Show error dialog
                console.log("ERROR: Failed to publish to repository");
                dialog.modal({
                    title : "Failed to Publish Notebook",
                    body : $("<div></div>")
                        .addClass("alert alert-danger")
                        .append("The GenePattern Notebook Repository encountered an error when attempting to publish the notebook."),
                    buttons: {"OK": function() {}}
                });
            }
        });
    }

    /**
     * Preview the selected notebook
     *
     * @param notebook
     */
    function preview_notebook(notebook) {
        const preview_url = GenePattern.repo.repo_url + "/notebooks/" + notebook['id'] + "/preview/";
        window.open(preview_url);
    }

    /**
     * Copy a notebook from the repo to the user's current directory
     *
     * @param notebook
     * @param current_directory
     */
    function copy_notebook(notebook, current_directory) {
        // Show the loading screen
        modal_loading_screen();

        // Call the repo service to publish the notebook
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

                // Refresh the file list
                $("#refresh_notebook_list").trigger("click");

                // Parse the data
                const response = JSON.parse(responseData);

                // Display a success dialog
                dialog.modal({
                    title : " Copied Notebook From Repository",
                    body : $("<div></div>")
                        .addClass("alert alert-success")
                        .append(
                            $("<p></p>")
                                .append("This notebook was successfully copied from the GenePattern Notebook Repository as: ")
                                .append($("<br/>"))
                                .append("<samp style='font-weight: bold;'>" + current_directory + '/' + response['filename'] + "</samp>.")
                        ),
                    buttons: {
                        "Open Notebook": {
                            "class": "btn-primary",
                            "click": function() {
                                window.open(force_user_path(response['url']))
                            }
                        },
                        "Close": function() {}
                    }
                });
            },
            error: function() {
                // Close the modal
                close_modal();

                // Show error dialog
                console.log("ERROR: Failed to copy from repository");
                dialog.modal({
                    title : "Failed to Copy Notebook",
                    body : $("<div></div>")
                        .addClass("alert alert-danger")
                        .append("The GenePattern Notebook Repository encountered an error when attempting to copy the notebook."),
                    buttons: {"OK": function() {}}
                });
            }
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
        // Show the loading screen
        modal_loading_screen();

        const success = function(responseData) {
            // Close the modal
            close_modal();

            // Refresh the file list
            get_sharing_list();
            $("#refresh_notebook_list").trigger("click");

            // Open the notebook
            let nb_url = null;
            if (notebook['my_path']) nb_url = window.location.protocol + '//' + window.location.hostname + Jupyter.notebook_list.base_url + 'notebooks/' + encodeURI(notebook['my_path']);
            else nb_url = window.location.protocol + '//' + window.location.hostname + Jupyter.notebook_list.base_url + 'notebooks/' + current_directory + encodeURI(notebook.name);
            window.open(nb_url);
        };

        const error = function() {
            // Close the modal
            close_modal();

            // Show error dialog
            console.log("ERROR: Failed to run the shared notebook");
            dialog.modal({
                title : "Failed to Run Shared Notebook",
                body : $("<div></div>")
                    .addClass("alert alert-danger")
                    .append("The GenePattern Notebook Repository encountered an error when attempting to run the shared notebook."),
                buttons: {"OK": function() {}}
            });
        };

        // Call the repo service to publish the notebook
        $.ajax({
            url: GenePattern.repo.repo_url + "/sharing/" + notebook['id'] + "/copy/" + current_directory,
            method: "PUT",
            crossDomain: true,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: custom_success ? custom_success : success,
            error: custom_error ? custom_error : error
        });
    }

    function update_invite(notebook, accepted=true) {
        // Show the loading screen
        modal_loading_screen();

        // Call the repo service to publish the notebook
        $.ajax({
            url: GenePattern.repo.repo_url + "/sharing/" + notebook['id'] + (accepted ? "/accept/" : "/decline/"),
            method: "PUT",
            crossDomain: true,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: function(responseData) {
                // Close the modal
                close_modal();

                // Refresh the list of notebooks
                get_sharing_list(function() {
                    $("a[data-tag='-shared-with-me']").click();
                });

                // Assemble the buttons
                const buttons = {};
                if (accepted) {
                    buttons["Run Notebook"] = {
                        "class": "btn-primary",
                        "click": function () {
                            const current_dir = Jupyter.notebook_list.notebook_path;
                            run_shared_notebook(notebook, current_dir);
                        }
                    };
                }
                buttons["OK"] = function() {};

                // Open the notebook
                dialog.modal({
                    title : "Notebook Invitation " + (accepted ? "Accepted" : "Declined"),
                    body : $("<div></div>")
                        .addClass("alert alert-success")
                        .append("You have " + (accepted ? "accepted" : "declined") + " the notebook sharing invitation. " +
                            (accepted ? "To open the notebook, click the <em>Run Notebook</em> button below." : "")),
                    buttons: buttons
                });

            },
            error: function() {
                // Close the modal
                close_modal();

                // Show error dialog
                console.log("ERROR: Failed to update the sharing invite");
                dialog.modal({
                    title : "Failed to Update Sharing Invite",
                    body : $("<div></div>")
                        .addClass("alert alert-danger")
                        .append("The GenePattern Notebook Repository encountered an error when attempting to update the notebook sharing invite."),
                    buttons: {"OK": function() {}}
                });
            }
        });
    }

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
        // Declare the buttons
        const buttons = {};
        buttons["Cancel"] = {"class" : "btn-default"};

        // If you are the owner
        if (notebook['owner']) {
            buttons["Edit Sharing"] = {
                "class": "btn-warning",
                "click": function() {
                    share_selected(notebook['my_path']);
                }};
        }

        // If you have a copy of the notebook
        if (notebook['my_path'] && !invite_dialog) {
            buttons["Go to Directory"] = {
                "class": "btn-info",
                "click": function() {
                    let url = window.location.protocol + '//' + window.location.hostname + Jupyter.notebook_list.base_url + 'tree/'; // Base part of URL

                    let slash_index = notebook['my_path'].lastIndexOf('/');             // Get the last slash, separating directory from file name
                    let directory_path = notebook['my_path'].substring(0, slash_index); // Get the directory path

                    url += directory_path + '#notebook_list';                           // Finish the URL
                    window.location.href = url;
                }};
        }

        if (invite_dialog) {
            buttons["Decline Invite"] = {
                "class": "btn-danger",
                "click": function () {
                    const current_dir = Jupyter.notebook_list.notebook_path;
                    update_invite(notebook, false);
                }
            };
            buttons["Accept Invite"] = {
                "class": "btn-primary",
                "click": function () {
                    const current_dir = Jupyter.notebook_list.notebook_path;
                    update_invite(notebook, true);
                }
            };
        }
        else {
            buttons["Run Notebook"] = {
                "class": "btn-primary",
                "click": function () {
                    const current_dir = Jupyter.notebook_list.notebook_path;
                    run_shared_notebook(notebook, current_dir);
                }
            };
        }

        // Sanitize the title
        let title = notebook['name'];
        if (title.length > 64) {
            title = title.substring(0,64) + "..."
        }

        // Build the body
        const body = $("<div></div>")
            .append(
                $("<div></div>")
                    .addClass("repo-dialog-labels")
                    .append("Users")
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
                    .append(get_collaborator_string(notebook))
                    .append($("<br/>"))
                    .append(notebook['api_path'].replace(/^.*[\\\/]/, ''))
                    .append($("<br/>"))
                    .append(get_shared_owner(notebook))
                    .append($("<br/>"))
                    .append(notebook['last_updated'])
            )
            .append(
                $("<div></div>")
                    .addClass("repo-dialog-description")
                    .append(notebook['description'])
            );

        // Show the modal dialog
        dialog.modal({
            title : title,
            body : body,
            buttons: buttons
        });
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
        $("a.item_link").each(function(i, element) {
            // If a notebook matches a path in the shared list
            const href = $(element).attr("href");
            const fixed_path = decodeURI(href.substring(Jupyter.notebook_list.base_url.length-1));

            const open_in_new_window = function() {
                window.open(href);
            };

            const is_my_share = GenePattern.repo.my_shared_paths.indexOf(fixed_path) >= 0;
            const is_other_share = GenePattern.repo.other_shared_paths.indexOf(fixed_path) >= 0;

            if (is_my_share || is_other_share) {
                // Attach sync callback
                $(element).attr("onclick", "Javascript:return false;");
                $(element).click(function() {
                    const current_dir = Jupyter.notebook_list.notebook_path;
                    const notebook = get_shared_notebook(home_relative_path(href));
                    run_shared_notebook(notebook, current_dir, open_in_new_window, open_in_new_window);
                });

                // Add a shared icon to it
                $(element).parent().find('.item_buttons').append(
                    $('<i title="' + (is_my_share ? 'Shared by me' : 'Shared with me') + '" class="item_icon icon-fixed-width fa fa-share-alt-square pull-right repo-shared-icon ' + (is_my_share ? 'repo-shared-by' : 'repo-shared-with') + '"></i>')
                )
            }
        })
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

    function build_sharing_table(notebooks, shared_by_me) {
        // Create the table
        const list_div = $("#repository-list");

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
        dt.order([1, 'asc']).draw();

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

    function get_current_sharing(nb_path, callback) {
        const api_path = GenePattern.repo.username + '/' + nb_path;

        $.ajax({
            url: GenePattern.repo.repo_url + "/sharing/current/" + api_path,
            method: "GET",
            crossDomain: true,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: function(response) {
                try {
                    const shared_with = JSON.parse(response)['shared_with'];
                    callback(shared_with);
                }
                catch (e) {
                    console.log("ERROR: Parsing response in get_current_sharing(): " + response);
                    callback([]);
                }

            },
            error: function(response) {
                console.log("ERROR: Getting current collaborators");
                console.log(response);
                callback([]);
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
     * Function to call when sharing a notebook
     */
    function share_selected(nb_path=null) {
        // If no selected notebook was provided, get which notebook is checked
        if (!nb_path) nb_path = home_relative_path(get_selected_path());

        get_current_sharing(nb_path, function(shared_with) {
            const shared = shared_with.length > 0;

            // Create buttons list
            const buttons = {};
            buttons["Cancel"] = {"class" : "btn-default"};

            if (shared) {
                buttons["Make Private"] = {
                    "class": "btn-danger",
                    "click": function () {
                        const notebook = get_shared_notebook(nb_path);
                        remove_shared_notebook(notebook);
                    }
                };
            }

            buttons[shared ? "Update" : "Share"] = {
                "class" : "btn-primary",
                "click": function() {
                    const success = function(response) {
                        // Close the old dialog
                        close_modal();

                        // Refresh the list of notebooks
                        get_sharing_list();
                        $("#refresh_notebook_list").trigger("click");

                        // Parse the message
                        const message = JSON.parse(response).success;

                        // Display a new dialog with the success message
                        dialog.modal({
                            title : "Notebook Shared",
                            body : $("<div></div>")
                                .addClass("alert alert-success")
                                .append(message),
                            buttons: {"OK": function() {}}
                        });
                    };

                    const errors = function(response) {
                        // Remove the loading screen
                        $(".repo-modal-cover").remove();

                        // Try to parse a JSON error response
                       try {
                           const json = JSON.parse(response.responseText);
                           console.log(json);

                           show_error_in_dialog(json.error);

                           // If errored users are provided, display this
                           if (json.users) {
                               json.users.forEach(function(u) {
                                   shared_user_error(u);
                               });
                           }
                       }
                       catch (e) {
                           // Assume this is a 500 error of some sort
                           show_error_in_dialog("An error occured while attempting to share the notebook.");
                       }
                    };

                    // Ensure the Share With list is not empty or only shared with the current user
                    if ((shared_with.length === 0) || (shared_with.length === 1 && shared_with[0] === GenePattern.repo.username)) {
                        show_error_in_dialog("Another user must be invited before sharing can begin.");
                        return false;
                    }

                    // Send list to the server
                    update_sharing(nb_path, shared_with, success, errors);

                    // Show the loading screen
                    modal_loading_screen();

                    // Wait for the callback to hide the dialog
                    return false;
                }};

            // Create the dialog body
            const body = $("<div/>");
            if (shared) {
                body.append(
                    $("<div/>")
                        .addClass("alert alert-info")
                        .append("This notebook has been shared with the users listed below. To update this list, remove or add users and then click Update.")
                );
            }
            else {
                body.append(
                    $("<div/>")
                        .addClass("alert alert-info")
                        .append("Enter the username or registered email address of those you want to share the notebook with below.")
                );
            }
            body.append(
                $("<h4></h4>")
                    .append("Send Sharing Invite")
            );
            body.append(
                $("<div></div>")
                    .addClass("row")
                    .append(
                        $("<div></div>")
                            .addClass("col-md-10")
                            .append(
                                $("<input/>")
                                    .addClass("form-control repo-shared-invite")
                                    .attr("type", "text")
                                    .attr("required", "required")
                                    .attr("maxlength", 64)
                                    .attr("placeholder", "Enter username or email")
                                    .keypress(function(e) {
                                        if (e.keyCode === 13) $(".repo-share-add").click();
                                    })
                            )
                    )
                    .append(
                        $("<div></div>")
                            .addClass("col-md-2")
                            .append("&nbsp;")
                            .append(
                                $("<button></button>")
                                    .addClass("btn btn-primary repo-share-add")
                                    .append("Add")
                                    .click(function() {
                                        const invite = $(".repo-shared-invite");
                                        const user = invite.val().trim().toLowerCase();
                                        invite.val("");

                                        if (user && shared_with.indexOf(user) === -1) add_shared_user(user, shared_with);
                                    })
                            )
                    )
            );
            body.append(
                $("<h4></h4>")
                    .append("Share With")
                    .css("margin-top", "30px")
            );

            // Create the shared list
            const shared_list_div = $("<div></div>")
                .addClass("repo-shared-list")
                .append(
                    $("<div></div>")
                        .addClass("repo-shared-nobody")
                        .text("Nobody")
                )
                .appendTo(body);

            // Add shared users to the list
            if (shared_with.length > 0) {
                for (let i = 0; i < shared_with.length; i++) {
                    const user = shared_with[i];
                    add_shared_user(user, shared_with, shared_list_div)
                }
            }

            // Show the modal dialog
            dialog.modal({
                title : "Share Notebook With Others",
                body : body,
                buttons: buttons
            });
        });
    }

    /**
     * Add a user to the shared list
     *
     * @param user
     * @param shared_with
     */
    function add_shared_user(user, shared_with, list) {
        list = list ? list : $(".repo-shared-list");
        const nobody = list.find(".repo-shared-nobody");

        // Add the user tag
        const tag = $("<div></div>")
            .addClass("repo-shared-user")
            .attr("title", user)
            .append(user)
            .append("&nbsp;")
            .append(
                $("<span></span>")
                    .addClass("fa fa-times")
                    .click(function() {
                        tag.remove();
                        shared_with.splice(shared_with.indexOf(user), 1);
                        if ($(".repo-shared-user:visible").length === 0) nobody.show();
                    })
            )
            .appendTo(list);

        // If the tag is for the current user, hide
        if (user === GenePattern.repo.username) tag.hide();
        else nobody.hide(); // Otherwise hide the nobody label

        if (shared_with.indexOf(user) === -1) shared_with.push(user);
    }

    /**
     * Function to call when publishing a notebook
     */
    function publish_selected() {
        const nb_path = get_selected_path();
        const published = is_nb_published(nb_path);
        const notebook = get_published(nb_path);
        const nb_name = notebook ? notebook['name'] : get_selected_name();
        const nb_description = notebook ? notebook['description'] : '';
        const nb_author = notebook ? notebook['author'] : '';
        const nb_quality = notebook ? notebook['quality'] : '';
        const nb_tags = notebook ? build_tag_list(notebook).join(',') : '';

        // Create buttons list
        const buttons = {};
        buttons["Cancel"] = {"class" : "btn-default"};
        if (published) {
            buttons["Unpublish"] = {
                "class": "btn-danger",
                "click": function() {
                    dialog.modal({
                        title : "Remove Notebook From Repository",
                        body : $("<div></div>")
                            .addClass("alert alert-warning")
                            .append("Are you sure that you want to remove this notebook from the GenePattern Notebook Repository?"),
                        buttons: {"Yes": {
                            "class" : "btn-danger",
                            "click": function() {
                                remove_notebook(notebook);
                                return false;
                            }
                        }, "Cancel": {}}
                    });

                    return true;
                }
            };
            buttons["Update"] = {
                "class" : "btn-primary",
                "click": function() {
                    // Make sure the form is filled out correctly
                    if (!form_valid()) return false;

                    publish_or_update(notebook, nb_path, published);

                    return false;
                }};
        }
        else {
            buttons["Publish"] = {
                "class" : "btn-primary",
                "click": function() {
                    // Make sure the form is filled out correctly
                    if (!form_valid()) return false;

                    publish_or_update(notebook, nb_path, published);

                    return false;
                }};
        }

        // Create the dialog body
        const body = $("<div/>");
        if (published) {
            body.append(
                $("<div/>")
                    .addClass("alert alert-info")
                    .append("A version of this notebook was published to the GenePattern Notebook Repository" +
                        " on " + notebook['publication'] + ". You may remove this notebook from the " +
                        "repository or update to the latest version in your workspace.")
            );
        }
        else {
            body.append(
                $("<div/>")
                    .addClass("alert alert-info")
                    .append("This will make a copy of the notebook available to anyone. A published notebook " +
                        "does not update automatically when you save it again in the future. To update the " +
                        "published copy you will have to click publish again after making any changes and saving.")
            );
        }
        body.append(
            $("<form/>")
                .append(
                    $("<div/>")
                        .addClass("form-group")
                        .append(
                            $("<label/>")
                                .addClass("repo-label")
                                .attr("for", "publish-name")
                                .append("Notebook Name")
                        )
                        .append(
                            $("<input/>")
                                .attr("id", "publish-name")
                                .addClass("form-control repo-input")
                                .attr("type", "text")
                                .attr("required", "required")
                                .attr("maxlength", 64)
                                .attr("value", nb_name)
                        )
                )
                .append(
                    $("<div/>")
                        .addClass("form-group")
                        .append(
                            $("<label/>")
                                .addClass("repo-label")
                                .attr("for", "publish-description")
                                .append("Description")
                        )
                        .append(
                            $("<input/>")
                                .attr("id", "publish-description")
                                .addClass("form-control repo-input")
                                .attr("type", "text")
                                .attr("required", "required")
                                .attr("maxlength", 256)
                                .attr("value", nb_description)
                        )
                )
                .append(
                    $("<div/>")
                        .addClass("form-group")
                        .append(
                            $("<label/>")
                                .addClass("repo-label")
                                .attr("for", "publish-author")
                                .append("Authors")
                        )
                        .append(
                            $("<input/>")
                                .attr("id", "publish-author")
                                .addClass("form-control repo-input")
                                .attr("type", "text")
                                .attr("required", "required")
                                .attr("maxlength", 128)
                                .attr("value", nb_author)
                        )
                )
                .append(
                    $("<div/>")
                        .addClass("form-group")
                        .append(
                            $("<label/>")
                                .addClass("repo-label")
                                .attr("for", "publish-quality")
                                .append("Quality")
                        )
                        .append(
                            $("<select/>")
                                .attr("id", "publish-quality")
                                .addClass("form-control repo-input")
                                .attr("required", "required")
                                .append($("<option></option>"))
                                .append($("<option>Development</option>"))
                                .append($("<option>Beta</option>"))
                                .append($("<option>Release</option>"))
                                .val(nb_quality)
                        )
                )
                .append(
                    $("<div/>")
                        .addClass("form-group")
                        .append(
                            $("<label/>")
                                .addClass("repo-label")
                                .attr("for", "publish-tags")
                                .append("Tags")
                        )
                        .append(
                            $("<input/>")
                                .attr("id", "publish-tags")
                                .addClass("form-control repo-input")
                                .attr("type", "text")
                                .attr("value", nb_tags)
                        )
                )

        );

        // Show the modal dialog
        dialog.modal({
            title : "Publish Notebook to Repository",
            keyboard_manager: Jupyter.keyboard_manager,
            body : body,
            buttons: buttons
        });

        // Initialize the tag widget
        setTimeout(function() {
            $("#publish-tags").tagit({
                singleField: true,
                caseSensitive: false,
                beforeTagAdded: function(event, obj) {
                    const protected_tags = get_protected_tags();
                    const tag = obj.tagLabel.toLowerCase();
                    if (protected_tags.includes(tag)) {
                        $(obj.tag).css("background-color", "gray");
                        return true;
                    }
                }
            });
        }, 200);
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

        // Removes /users/foo/ if it's prepended to the path
        const standardized_url = api_path.substring(Jupyter.notebook_list.base_url.length-1);

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
        // Declare the buttons
        const buttons = {};
        buttons["Cancel"] = {"class" : "btn-default"};

        // If this is your notebook
        if (GenePattern.repo.username === notebook['owner']) {
            buttons["Go to Directory"] = {
                "class": "btn-info",
                "click": function() {
                    window.location.href = build_dir_url(notebook) + "#notebook_list";
                }};

            buttons["Unpublish"] = {
                "class": "btn-danger",
                "click": function() {
                    remove_notebook(notebook);
                    return false;
                }};
        }

        buttons["Preview"] = {
            "class": "btn-default",
            "click": function() {
                preview_notebook(notebook);
            }};

        buttons["Run Notebook"] = {
            "class": "btn-primary",
            "click": function() {
                const current_dir = Jupyter.notebook_list.notebook_path;
                copy_notebook(notebook, current_dir);
            }};

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
                    .append(notebook['owner'])
                    .append($("<br/>"))
                    .append(notebook['publication'])
            )
            .append(
                $("<div></div>")
                    .addClass("repo-dialog-description")
                    .append(notebook['description'])
            );

        // Show the modal dialog
        dialog.modal({
            title : title,
            body : body,
            buttons: buttons
        });
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

    /**
     * Transforms the JSON notebooks object into a list of lists,
     * to be consumed by data tables
     */
    function public_notebook_list(tag) {
        const built_list = [];

        GenePattern.repo.public_notebooks.forEach(function(nb) {
            const tags = build_tag_list(nb);

            // If no tag specified, return all notebooks without a pinned tag
            if (!tag && no_pinned_tags(tags)) built_list.push([nb.id, nb.name, nb.description, nb.author, nb.publication, nb.quality, tags]);

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
        const pinned_tags = new Set(get_pinned_tags());
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
    function build_repo_tab() {
        // Add Notebook Sidebar
        build_notebook_sidebar();
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

    function get_pinned_tags() {
        // If already cached, return the list
        if (GenePattern.repo.pinned_tags) return GenePattern.repo.pinned_tags;

        // Otherwise, generate the list
        const pinned_tags = [];
        GenePattern.repo.public_notebooks.forEach(function(nb) {
            if (nb.tags) {
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
        GenePattern.repo.pinned_tags = pinned_tags;
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

    function select_sidebar_nav(link) {
        // Remove the old active class
        const nav = $("#repo-sidebar");
        nav.find("li").removeClass("active");

        // Add the new active class
        link.parent().addClass("active");

        // Set the header label
        $("#repo-header-label").html(link.html());

        // Remove the old notebook table
        $("#repository-list").empty();

        // Get the data tag
        const tag = link.attr("data-tag");
        const nb_header = $("#repo-header-notebooks");

        // If shared notebook
        if (tag.startsWith('-shared-')) {
            nb_header.hide();

            const mine = tag === '-shared-by-me';
            const shared_nb_matrix = shared_notebook_matrix(mine);
            build_sharing_table(shared_nb_matrix, mine);
        }

        // If public notebook
        else {
            nb_header.show();
            const filtered_notebook_list = public_notebook_list(link.attr("data-tag"));
            build_notebook_table(filtered_notebook_list);
        }
    }

    function create_sidebar_nav(tag, label) {
        const li = $('<li role="presentation"></li>');
        const link = $('<a href="#" data-tag="' + tag + '">' + label + '</a>');
        if (tag === '-shared-with-me') link.append($('<span class="badge repo-notifications" title="New Sharing Invites"></span>'));

        // Attach the click event
        link.click(function() {
            select_sidebar_nav(link);
        });

        // Assemble the elements and return
        li.append(link);
        return li;
    }

    function build_notebook_sidebar() {
        const pinned_tags = get_pinned_tags();
        const nav = $("#repo-sidebar-nav");

        // Empty the sidebar when refreshing the list
        nav.empty();

        // For each pinned tag, add to the sidebar
        pinned_tags.forEach(function(tag) {
            nav.append(create_sidebar_nav(tag, tag));
        });

        // Add the community tag
        nav.append(create_sidebar_nav('', 'community'));

        // Select the first nav
        select_sidebar_nav(nav.find("a:first"));
    }

    /**
     * Build and attach a notebook DataTable to the Public Notebooks tab
     *
     * @param label
     * @param notebooks
     */
    function build_notebook_table(notebooks) {
        // Create the table
        const list_div = $("#repository-list");

        const table = $("<table></table>")
            .addClass("table table-striped table-bordered table-hover")
            .appendTo(list_div);

        // Initialize the DataTable
        const dt = table.DataTable({
            "oLanguage": {
                "sEmptyTable": "No public notebooks are available in the repository."
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
        dt.order([1, 'asc']).draw();

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
                admin_tag_dialog(tag);
            }
            else {
                // Filter the table by this tag
                const search_box = $("#repository-list").find("input[type=search]");
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
    function admin_tag_dialog(tag) {
        const pinned_tags = get_pinned_tags();
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
        $("#repository-list").empty();
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
                if (Jupyter.notebook_list) {
                    empty_notebook_list(); // Empty the list of any existing state
                    build_repo_tab(); // Populate the repository tab
                }

                GenePattern.repo.last_refresh = new Date(); // Set the time of last refresh
                if (success_callback) success_callback();
            },
            error: function() {
                console.log("ERROR: Could not obtain list of public notebooks");
            }
        });
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

    /**
     * Gets the username from a variety of possible sources
     *
     * @returns {string}
     */
    function extract_username() {
        let username = null;

        // Try to get username from GPNB cookie
        const cookie_map = cookie_to_map();
        if (cookie_map['gpnb-username'] !== undefined &&
            cookie_map['gpnb-username'] !== null &&
            cookie_map['gpnb-username'] !== 'undefined' &&
            cookie_map['gpnb-username'] !== 'null') {
            username = cookie_map['gpnb-username'];
        }

        // Try to get username from JupyterHub cookie
        if (username === null) {
            $.each(cookie_map, function(i) {
                if (i.startsWith("jupyter-hub-token-")) {
                    username = decodeURIComponent(i.match(/^jupyter-hub-token-(.*)/)[1]);
                }
            });
        }

        // Try to get the username from the URL
        if (username === null) {
            const url_parts = window.location.href.split('/');
            if (url_parts.length >= 5 &&
                url_parts[0] === window.location.protocol &&
                url_parts[1] === '' &&
                url_parts[2] === window.location.host &&
                url_parts[3] === 'user') {
                username = decodeURI(url_parts[4])
            }
        }

        // If all else fails, prompt the user
        if (username === null) {
            username = prompt("What is your username?", "");
        }

        // Set a GPNB cookie
        document.cookie = 'gpnb-username' + '=' + username;

        return username;
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
                // Set token and make callback
                GenePattern.repo.token = data['token'];
                GenePattern.repo.admin = data['admin'];
                if (success_callback) success_callback();
            },
            error: function() {
                console.log("ERROR: Could not authenticate with GenePattern Notebook Repository.");
            }
        });
    }

    /**
     * Add the published icons to the user's notebooks
     */
    function add_published_icons() {
        $("a.item_link").each(function(i, element) {
            // If a notebook matches a path in the published list
            if (GenePattern.repo.my_nb_paths.indexOf($(element).attr("href")) >= 0) {
                // Add a published icon to it
                $(element).parent().find('.item_buttons').append(
                    $('<i title="Published to Repository" class="item_icon icon-fixed-width fa fa-share-square pull-right repo-publish-icon"></i>')
                )
            }
        })
    }

    /**
     * Initialize the repo tab and search box
     */
    function init_repo_tab() {
        // Create the public notebooks tab
        $("#tabs").append(
            $('<li></li>')
                .append(
                    $('<a href="#repository" data-toggle="tab" class="repository_tab_link"></a>')
                        .append("Public Notebooks ")
                        .append('<span class="badge repo-notifications" title="New Sharing Invites"></span>')
                        .click(function() {
                            window.location.hash = 'repository';
                        })
                )
        );

        // Add the contents of the public notebooks tab
        $("#tab_content").find(".tab-content")
            .append(
                $('<div id="repository" class="tab-pane"></div>')
                    .append(
                        $("<div id='repo-sidebar' class='col-md-2'></div>")
                            .append($("<h4>Public Notebooks</h4>"))
                            .append($("<ul id='repo-sidebar-nav' class='nav nav-pills'></ul>"))
                            .append($("<h4>Shared Notebooks</h4>"))
                            .append($("<ul id='repo-sidebar-shared' class='nav nav-pills'></ul>"))
                    )
                    .append(
                        $('<div class="list_container col-md-10">')
                            .append(
                                $('<div id="repository-list-header" class="row list_header repo-header"></div>')
                                    .append("<span id='repo-header-label'></span> <span id='repo-header-notebooks'>Notebooks</span>")
                            )
                            .append(
                                $('<div id="repository-list" class="row"></div>')
                            )
                    )
                    .ready(function() {
                        // Display the Public Notebooks tab, if selected
                        if (window.location.hash === "#repository") {
                            setTimeout(function() {
                                $(".repository_tab_link").tab('show');
                            }, 1);
                        }
                    })
            );

        // Attach the shared menu items
        $("#repo-sidebar-shared")
            .append(create_sidebar_nav("-shared-by-me", "Shared by Me"))
            .append(create_sidebar_nav("-shared-with-me", "Shared with Me"));
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

    // Add publish link to notebook File menu
    function add_publish_link() {
        const help_section = $("#file_menu");
        const trust_notebook = help_section.find("#trust_notebook");
        trust_notebook.before(
            $("<li></li>")
                .append(
                    $("<a href='#' target='_blank'>Publish to Repository</a>")
                        .click(function() {
                            validate_notebook();
                            return false;
                        })
                )
        );
        trust_notebook.before($("<li class='divider'></li>"));
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

    function notify_about_editors(editor_list, error_encountered=false) {
        let editors_notification = $("#repo-editors");

        // Save the list of current editors
        GenePattern.repo.current_editors = editor_list;

        // Does the editors notification exist? If not, create it
        if (!editors_notification.length) editors_notification = create_editing_notification();

        // If there are current editors, show the notification and update count
        if (editor_list.length) {
            // Update the displayed count
            $(".repo-editing-count").text(editor_list.length);

            // Show or hide the s in other(s)
            if (editor_list.length > 1) $(".repo-editing-s").show();
            else $(".repo-editing-s").hide();

            // Show the notification
            editors_notification.show();
        }

        // Otherwise hide it
        else editors_notification.hide();
    }

    function collaborator_poll() {
        // No need to poll if this is not a shared notebook
        if (!in_shared_notebook()) return;

        // Poll the server for a list of current editors (not including you)
        $.ajax({
            url: GenePattern.repo.repo_url + "/sharing/heartbeat/" + Jupyter.notebook.notebook_path,
            method: ("PUT"),
            crossDomain: true,
            dataType: 'json',
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: function(editor_list) {
                // Show the notification, if necessary
                notify_about_editors(editor_list, false);
            },
            error: function() {
                // Show the notification
                notify_about_editors([], true);
            },
            complete: function() {
                // Poll again in one minute
                setTimeout(collaborator_poll, 60000);
            }
        });
    }

    /*
     * If we are currently viewing the notebook list
     * Attach the repository events if they haven't already been initialized
     */
    if (Jupyter.notebook_list !== undefined && Jupyter.notebook_list !== null && !GenePattern.repo.events_init) {
        // Mark repo events as initialized
        GenePattern.repo.events_init = true;

        // Add publish button and bind events
        $(".dynamic-buttons")
            .prepend(
                $("<button></button>")
                    .addClass("publish-button btn btn-default btn-xs")
                    .attr("title", "Publish selected")
                    .append("Publish")
                    .click($.proxy(publish_selected, this))
                    .hide()
            )
            .prepend(" ")
            .prepend(
                $("<button></button>")
                    .addClass("share-button btn btn-default btn-xs")
                    .attr("title", "Share selected")
                    .append("Share")
                    .click(() => share_selected())
                    .hide()
            );
        $(document).click($.proxy(selection_changed, this));

        // Initialize repo search
        init_repo_tab();

        // Authenticate and the list of public notebooks
        do_authentication(function() {
            get_notebooks(function() {
                add_published_icons();
            });
            get_sharing_list(function() {
                add_sharing_icons();
            });
        });

        // Refresh notebooks in the list if the tab is clicked
        init_repo_refresh();

        // When the files list is refreshed
        $([Jupyter.events]).on('draw_notebook_list.NotebookList', function() {
            add_published_icons();
            add_sharing_icons();
        });
    }

    /*
     * If we are currently viewing a notebook
     */
    if (Jupyter.notebook !== undefined) {
        // Authenticate
        do_authentication(function() {
            get_notebooks(function() {
                // Add publish link to the toolbar
                add_publish_link();
            });
            get_sharing_list(function() {
                // Update the shared canonical copy upon save
                init_save_sync();

                // Notify the user when someone else is editing the notebook
                collaborator_poll();
            });
        });
    }
});