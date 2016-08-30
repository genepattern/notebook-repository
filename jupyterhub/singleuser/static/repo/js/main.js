// Initialize GenePattern global variables
var GenePattern = GenePattern || {};
GenePattern.repo = GenePattern.repo || {};
GenePattern.repo.events_init = GenePattern.repo.events_init || false;
GenePattern.repo.public_notebooks = GenePattern.repo.public_notebooks || [];
GenePattern.repo.my_nb_paths = GenePattern.repo.my_nb_paths || [];
GenePattern.repo.username = GenePattern.repo.username || null;
GenePattern.repo.repo_url = GenePattern.repo.repo_url || null;
GenePattern.repo.token = GenePattern.repo.token || null;

require(['base/js/namespace', 'jquery', 'base/js/dialog'], function(Jupyter, $, dialog) {
    "use strict";

    // Load css
    $('head').append(
        $('<link rel="stylesheet" type="text/css" />')
            .attr("rel", "stylesheet")
            .attr("type", "text/css")
            .attr('href', '/static/repo/css/repo.css')
    );

    /**
     * Get the api path to the selected notebook
     *
     * @returns {string|null}
     */
    function get_selected_path() {
        var checkbox = $("#notebook_list").find("input:checked");

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
        var checkbox = $("#notebook_list").find("input:checked");

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
     * Determine if the given api path is one of my shared notebooks
     *
     * @param api_path
     * @returns {boolean}
     */
    function is_nb_shared(api_path) {
        return GenePattern.repo.my_nb_paths.indexOf(api_path) >= 0;
    }

    /**
     * Get the JSON info for the shared notebook, return null otherwise
     *
     * @param api_path
     * @returns {object|null}
     */
    function get_shared(api_path) {
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
        $("#notebook_list").find(".repo-share-icon").remove();
    }

    /**
     * Send a notebook to the repo to publish or update it
     *
     * @param notebook
     * @param nb_path
     * @param shared
     */
    function publish_or_update(notebook, nb_path, shared) {
        // Get the notebook data structure
        var pub_nb = make_nb_json(notebook, nb_path);

        // Show the loading screen
        modal_loading_screen();

        // Call the repo service to publish the notebook
        $.ajax({
            url: (shared ? notebook['url'] : GenePattern.repo.repo_url + "/notebooks/"),
            method: (shared ? "PUT" : "POST"),
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
                            (shared ?
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
                                .append("This notebook was successfully copied from the GenePattern Notebook Repository as " +
                                    response['filename'] + ".")
                        )
                        .append(
                            $("<p></p>")
                                .append("<a target='_blank' href='" + response['url'] +
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
            url: notebook['url'],
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

    /**
     * Function to call when sharing a notebook
     */
    function share_selected() {
        var nb_path = get_selected_path();
        var shared = is_nb_shared(nb_path);
        var notebook = get_shared(nb_path);
        var nb_name = notebook ? notebook['name'] : get_selected_name();
        var nb_description = notebook ? notebook['description'] : '';
        var nb_author = notebook ? notebook['author'] : '';
        var nb_quality = notebook ? notebook['quality'] : '';

        // Create buttons list
        var buttons = {};
        buttons["Cancel"] = {"class" : "btn-default"};
        if (shared) {
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

                    publish_or_update(notebook, nb_path, shared);

                    return false;
                }};
        }
        else {
            buttons["Publish"] = {
                "class" : "btn-primary",
                "click": function() {
                    // Make sure the form is filled out correctly
                    if (!form_valid()) return false;

                    publish_or_update(notebook, nb_path, shared);

                    return false;
                }};
        }

        // Create the dialog body
        var body = $("<div/>");
        if (shared) {
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
        if (selected.length == 1 && !has_directory && !has_file) {
            $('.share-button').css('display', 'inline-block');
        }
        else {
            $('.share-button').css('display', 'none');
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
     * Builds the repository tab
     */
    function build_repo_tab() {
        var list_div = $("#repository-list");
        GenePattern.repo.public_notebooks.forEach(function(nb) {
            var owner = GenePattern.repo.username == nb['owner'];
            list_div.append(
                $("<div></div>")
                    .addClass("list_item row")
                    .append(
                        $("<div></div>")
                            .addClass("col-md-12 repo-list")
                            .append($('<i class="item_icon notebook_icon icon-fixed-width repo-nb-icon"></i>'))
                            .append(
                                $("<div></div>")
                                    .addClass("pull-right repo-list-author")
                                    .append(nb['author'])

                            )
                            .append(
                                $("<div></div>")
                                    .addClass("repo-list-name")
                                    .append(owner ? '<span class="label label-primary">Owner<span>' : '')
                                    .append(owner ? '&nbsp;' : '')
                                    .append(nb['name'])

                            )
                            .append(
                                $("<div></div>")
                                    .addClass("repo-nb-description")
                                    .append(nb['description'])
                            )
                            .append(
                                $("<div></div>")
                                    .addClass("repo-nb-metadata hidden")
                                    .append(nb['quality'])
                                    .append(' ' + nb['owner'])
                                    .append(' ' + nb['publication'])
                                    .append(' ' + nb['api_path'])
                            )
                            .click(function() {
                                repo_nb_dialog(nb);
                            })
                    )
            );
        });
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
                nb_path_list(); // Build the path list for displaying share icons
                build_repo_tab(); // Populate the repository tab
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
            // If a notebook matches a path in the shared list
            if (GenePattern.repo.my_nb_paths.indexOf($(element).attr("href")) >= 0) {
                // Add a shared icon to it
                $(element).parent().find('.item_buttons').append(
                    $('<i title="Published to Repository" class="item_icon icon-fixed-width fa fa-share-square pull-right repo-share-icon"></i>')
                )
            }
        })
    }

    /**
     * Initialize the repo search box
     */
    function init_search() {
        $("#repository-search")
            .keydown(function(event) {
                event.stopPropagation();
            })
            .keyup(function(event) {
                var search = $(event.target).val().toLowerCase();
                $.each($("#repository-list").find(".list_item"), function(index, element) {
                    var raw = $(element).text().toLowerCase();
                    if (raw.indexOf(search) === -1) {
                        $(element).hide();
                    }
                    else {
                        $(element).show();
                    }
                });
            });
    }

    /*
     * Bind events for action buttons.
     */
    $('.share-button')
        .click($.proxy(share_selected, this))
        .hide();
    $(document).click($.proxy(selection_changed, this));

    /*
     * Attach the repository events if they haven't already been initialized
     */
    if (!GenePattern.repo.events_init) {
        // Mark repo events as initialized
        GenePattern.repo.events_init = true;

        // Initialize repo search
        init_search();

        // Authenticate and the list of public notebooks
        do_authentication(function() {
            get_notebooks(function() {
                add_published_icons();
            });
        });

        // When the files list is refreshed
        $([Jupyter.events]).on('draw_notebook_list.NotebookList', function() {
            add_published_icons();
        });
    }
});