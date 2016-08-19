// Initialize GenePattern global variables
var GenePattern = GenePattern || {};
GenePattern.repo = GenePattern.repo || {};
GenePattern.repo.events_init = GenePattern.repo.events_init || false;
GenePattern.repo.public_notebooks = GenePattern.repo.public_notebooks || [];
GenePattern.repo.my_nb_paths = GenePattern.repo.my_nb_paths || [];

// TODO: FIXME get the real username
var username = 'thorin';

require(['base/js/namespace', 'jquery', 'base/js/dialog'], function(Jupyter, $, dialog) {
    "use strict";

    // Load css
    $('head').append(
        $('<link rel="stylesheet" type="text/css" />')
            .attr("rel", "stylesheet")
            .attr("type", "text/css")
            .attr('href', '/static/repo/css/repo.css')
    );

    // Get the api path to the selected notebook
    function get_selected_path() {
        var checkbox = $("#notebook_list").find("input:checked");

        // Handle errors
        if (checkbox.length < 1) {
            console.log("ERROR: No selected notebooks found");
            return null;
        }

        return checkbox.parent().find("a.item_link").attr("href");
    }

    // Get the name of the selected notebook
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

    // Determine if the given api path is one of my shared notebooks
    function is_nb_shared(api_path) {
        return GenePattern.repo.my_nb_paths.indexOf(api_path) >= 0;
    }

    // Get the JSON info for the shared notebook, return null otherwise
    function get_shared(api_path) {
        for (var i = 0; i < GenePattern.repo.public_notebooks.length; i++) {
            var nb = GenePattern.repo.public_notebooks[i];
            if (nb["api_path"] === api_path) {
                return nb;
            }
        }

        return null;
    }

    // Function to call when sharing a notebook
    function share_selected() {
        var nb_path = get_selected_path();
        var nb_name = get_selected_name();
        var shared = is_nb_shared(nb_path);
        var notebook = get_shared(nb_path);

        // Create buttons list
        var buttons = {};
        buttons["Cancel"] = {"class" : "btn-default"};
        if (shared) {
            buttons["Remove"] = {"class" : "btn-danger"};
            buttons["Update"] = {"class" : "btn-primary"};
        }
        else {
            buttons["Publish"] = {"class" : "btn-primary"};
        }

        // Create the dialog body
        var body = $("<div/>");
        if (shared) {
            body.append(
                $("<div/>")
                    .addClass("alert alert-info")
                    .append("A version of this notebook has already been published to the " +
                        "GenePattern Notebook Repository. You may remove this notebook from the " +
                        "repository or update to the latest version in your workspace.")
            );
        }
        else {
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
                                    .addClass("form-control")
                                    .attr("type", "text")
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
                                    .addClass("form-control")
                                    .attr("type", "text")
                                    .attr("maxlength", 256)
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
                                    .addClass("form-control")
                                    .attr("type", "text")
                                    .attr("maxlength", 128)
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
                                    .addClass("form-control")
                                    .append($("<option>Development</option>"))
                                    .append($("<option>Beta</option>"))
                                    .append($("<option>Release</option>"))
                            )
                    )

            );
        }

        // Show the modal dialog
        dialog.modal({
            title : "Publish Notebook to Repository",
            body : body,
            buttons: buttons
        });
    }

    // Function to call when the file list selection has changed
    function selection_changed() {
        var selected = [];
        var has_running_notebook = false;
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

    // Function builds a path list from the public notebooks
    function nb_path_list() {
        GenePattern.repo.my_nb_paths = [];
        GenePattern.repo.public_notebooks.forEach(function(nb) {
            if (nb['owner'] === username) {
                GenePattern.repo.my_nb_paths.push(nb['api_path']);
            }
        });
    }

    // Builds the repository tab
    function build_repo_tab() {
        var list_div = $("#repository-list");
        GenePattern.repo.public_notebooks.forEach(function(nb) {
            list_div.append(
                $("<div></div>")
                    .addClass("list_item row")
                    .append(
                        $("<div></div>")
                            .addClass("col-md-12")
                            .append(
                                $('<i class="item_icon notebook_icon icon-fixed-width repo-nb-icon"></i>')
                            )
                            .append(nb['owner'])
                            .append(' / ')
                            .append(nb['name'])
                            .append(
                                $("<div></div>")
                                    .addClass("repo-nb-description")
                                    .append(nb['description'])
                            )
                    )
            );
        });
    }

    // Bind events for action buttons.
    $('.share-button')
        .click($.proxy(share_selected, this))
        .hide();
    $(document).click($.proxy(selection_changed, this));

    // Attach the repository events if they haven't already been initialized
    if (!GenePattern.repo.events_init) {
        // Mark repo events as initialized
        GenePattern.repo.events_init = true;

        // Get the list of public notebooks
        $.ajax({
            url: "http://127.0.0.1:8000/notebooks/",
            crossDomain: true,
            success: function(response) {
                GenePattern.repo.public_notebooks = response['results'];
                nb_path_list(); // Build the path list for displaying share icons
                build_repo_tab(); // Populate the repository tab
            },
            error: function() {
                console.log("ERROR: Could not obtain list of public notebooks");
            }
        });

        // When the files list is refreshed
        $([Jupyter.events]).on('draw_notebook_list.NotebookList', function() {
            $("a.item_link").each(function(i, element) {
                // If a notebook matches a path in the shared list
                if (GenePattern.repo.my_nb_paths.indexOf($(element).attr("href")) >= 0) {
                    // Add a shared icon to it
                    $(element).parent().find('.item_buttons').append(
                        $('<i title="Published to Repository" class="item_icon icon-fixed-width fa fa-share-square pull-right"></i>')
                    )
                }
            })
        });
    }
});