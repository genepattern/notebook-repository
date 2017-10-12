// Initialize GenePattern global variables
var GenePattern = GenePattern || {};
GenePattern.repo = GenePattern.repo || {};
GenePattern.repo.events_init = GenePattern.repo.events_init || false;
GenePattern.repo.public_notebooks = GenePattern.repo.public_notebooks || [];
GenePattern.repo.my_nb_paths = GenePattern.repo.my_nb_paths || [];
GenePattern.repo.username = GenePattern.repo.username || null;
GenePattern.repo.repo_url = GenePattern.repo.repo_url || null;
GenePattern.repo.token = GenePattern.repo.token || null;
GenePattern.repo.last_refresh = GenePattern.repo.last_refresh || null;

require(['base/js/namespace', 'jquery', 'base/js/dialog', 'https://cdn.datatables.net/1.10.15/js/jquery.dataTables.min.js'], function(Jupyter, $, dialog, datatables) {
    "use strict";

    /**
     * Get the api path to the selected notebook
     *
     * @returns {string|null}
     */
    function get_selected_path() {
        var checkbox = $('#notebook_list').find('input:checked');

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
        var checkbox = $('#notebook_list').find('input:checked');

        // Handle errors
        if (checkbox.length < 1) {
            console.log("ERROR: No selected notebooks found");
            return null;
        }

        // Get file name
        var raw_name = checkbox.parent().find("a.item_link").text();

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
        for (var i = 0; i < GenePattern.repo.public_notebooks.length; i++) {
            var nb = GenePattern.repo.public_notebooks[i];
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
        var today = new Date();
        var month = ("0" + (today.getMonth() + 1)).slice(-2);
        var date = ("0" + today.getDate()).slice(-2);
        var year = today.getFullYear();
        return year + '-' + month + '-' + date;
    }

    /**
     * Display the loading screen for the modal dialog
     */
    function modal_loading_screen() {
        var to_cover = $(".modal-body");
        var cover = $("<div></div>")
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
        var pub_nb = notebook ? notebook : {
            "owner": GenePattern.repo.username,
            "file_path": nb_path, // Will be replaced server-side
            "api_path": nb_path
        };

        // Set values based on form
        pub_nb['name'] = $("#publish-name").val();
        pub_nb['description'] = $("#publish-description").val();
        pub_nb['author'] = $("#publish-author").val();
        pub_nb['quality'] = $("#publish-quality").val();

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
        var is_valid = true;

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
        var pub_nb = make_nb_json(notebook, nb_path);

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
                var response = JSON.parse(responseData);

                // Display a success dialog
                dialog.modal({
                    title : " Copied Notebook From Repository",
                    body : $("<div></div>")
                        .addClass("alert alert-success")
                        .append(
                            $("<p></p>")
                                .append("This notebook was successfully copied from the GenePattern Notebook Repository as: ")
                                .append($("<br/>"))
                                .append("<samp style='font-weight: bold;'>" + response['filename'] + "</samp>.")
                        )
                        .append(
                            $("<p></p>")
                                .append("<a target='_blank' href='" + force_user_path(response['url']) +
                                    "' class='alert-link'>Click here</a> if you would like to open this notebook.")
                        ),
                    buttons: {"OK": function() {}}
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
        $.ajax({
            url: GenePattern.repo.repo_url + "/sharing/current" + nb_path,
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
    function share_selected() {
        const nb_path = get_selected_path();

        get_current_sharing(nb_path, function(shared_with) {
            const shared = shared_with.length > 0;

            // Create buttons list
            const buttons = {};
            buttons["Cancel"] = {"class" : "btn-default"};
            buttons[shared ? "Update" : "Share"] = {
                "class" : "btn-primary",
                "click": function() {
                    const success = function(response) {
                        // Close the old dialog
                        close_modal();

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
                            )
                    )
                    .append(
                        $("<div></div>")
                            .addClass("col-md-2")
                            .append("&nbsp;")
                            .append(
                                $("<button></button>")
                                    .addClass("btn btn-primary")
                                    .append("Add")
                                    .click(function() {
                                        const invite = $(".repo-shared-invite");
                                        const user = invite.val().trim();
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

        // Hide the nobody label
        const nobody = list.find(".repo-shared-nobody");
        nobody.hide();

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
                        if (shared_with.length === 0) nobody.show();
                    })
            )
            .appendTo(list);
        if (shared_with.indexOf(user) === -1) shared_with.push(user);
    }

    /**
     * Function to call when publishing a notebook
     */
    function publish_selected() {
        var nb_path = get_selected_path();
        var published = is_nb_published(nb_path);
        var notebook = get_published(nb_path);
        var nb_name = notebook ? notebook['name'] : get_selected_name();
        var nb_description = notebook ? notebook['description'] : '';
        var nb_author = notebook ? notebook['author'] : '';
        var nb_quality = notebook ? notebook['quality'] : '';

        // Create buttons list
        var buttons = {};
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
        var body = $("<div/>");
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

        );

        // Show the modal dialog
        dialog.modal({
            title : "Publish Notebook to Repository",
            body : body,
            buttons: buttons
        });
    }

    /**
     * Function to call when the file list selection has changed
     */
    function selection_changed() {
        var selected = [];
        var has_directory = false;
        var has_file = false;
        var checked = 0;
        $('.list_item :checked').each(function(index, item) {
            var parent = $(item).parent().parent();

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
            }
        });

        // Sharing isn't visible when a directory or file is selected.
        // To allow sharing multiple notebooks at once: selected.length > 0 && !has_directory && !has_file
        if (selected.length === 1 && !has_directory && !has_file) {
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
        return notebook['api_path'].match(/^(.*[\\\/])/)[1].replace("/notebooks/", "/tree/", 1);
    }

    /**
     * Show a dialog with details about the notebook
     *
     * @param notebook
     */
    function repo_nb_dialog(notebook) {
        // Declare the buttons
        var buttons = {};
        buttons["Cancel"] = {"class" : "btn-default"};

        // If this is your notebook
        if (GenePattern.repo.username == notebook['owner']) {
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

        buttons["Get a Copy"] = {
            "class": "btn-primary",
            "click": function() {
                var current_dir = Jupyter.notebook_list.notebook_path;
                copy_notebook(notebook, current_dir);
            }};

        // Sanitize the title
        var title = notebook['name'];
        if (title.length > 32) {
            title = title.substring(0,32) + "..."
        }

        // Build the body
        var body = $("<div></div>")
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
     * Transforms the JSON notebooks object into a list of lists,
     * to be consumed by data tables
     */
    function public_notebook_list() {
        var built_list = [];

        GenePattern.repo.public_notebooks.forEach(function(nb) {
            built_list.push([nb.id, nb.name, nb.description, nb.author, nb.publication, nb.quality]);
        });

        return built_list;
    }

    /**
     * Return the notebook matching the provided ID
     * @param id
     * @returns {*}
     */
    function get_notebook(id) {
        var selected = null;
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
        // Create the table
        var list_div = $("#repository-list");
        var table = $("<table></table>")
            .addClass("table table-striped table-bordered table-hover")
            .appendTo(list_div);

        // Initialize the DataTable
        var dt = table.DataTable({
            "data": public_notebook_list(),
            "pageLength": 25,
            "columns": [
                {"title": "ID", "visible": false, "searchable": false},
                {"title": "Notebook"},
                {"title": "Description", "visible": false},
                {"title": "Authors"},
                {"title":"Updated"},
                {"title":"Quality"}
            ]
        });

        // Add event listener for notebook dialogs
        table.find("tbody").on('click', 'tr', function () {
            var data = dt.row( this ).data();
            var id = data[0];
            var nb = get_notebook(id);
            repo_nb_dialog(nb);
        });

        // Add the popovers
        table.find("tbody").find("tr").each(function(i, e) {
            var data = dt.row(e).data();
            var element = $(this);
            element.find("td:first").popover({
                title: data[1],
                content: data[2],
                placement: "right",
                trigger: "hover",
                container: "body"
            });
        });
    }

    /**
     * Initialize the periodic refresh of the notebook repository tab
     */
    function init_repo_refresh() {
        // When the repository tab is clicked
        $(".repository_tab_link").click(function() {
            var ONE_MINUTE = 60000;

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
                empty_notebook_list(); // Empty the list of any existing state
                build_repo_tab(); // Populate the repository tab
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
        var cookie_map = {};

        document.cookie.split(';').forEach(function(cookie_str) {
            var pair = cookie_str.split('=');
            var key = pair[0].trim();
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
        var username = null;

        // Try to get username from GPNB cookie
        var cookie_map = cookie_to_map();
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
            var url_parts = window.location.href.split('/');
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
        GenePattern.repo.repo_url = window.location.protocol + '//' + window.location.hostname + ':8000';
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
                .append($('<a href="#repository" data-toggle="tab" class="repository_tab_link" >Public Notebooks</a>'))
        );

        // Add the contents of the public notebooks tab
        $("#tab_content").find(".tab-content")
            .append(
                $('<div id="repository" class="tab-pane"></div>')
                    .append(
                        $('<div class="list_container">')
                            .append(
                                $('<div id="repository-list-header" class="row list_header repo-header"></div>')
                                    .append("Public Notebooks")
                            )
                            .append(
                                $('<div id="repository-list" class="row"></div>')
                            )
                    )
            );
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
                    .click($.proxy(share_selected, this))
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
        });

        // Refresh notebooks in the list if the tab is clicked
        init_repo_refresh();

        // When the files list is refreshed
        $([Jupyter.events]).on('draw_notebook_list.NotebookList', function() {
            add_published_icons();
        });
    }
});