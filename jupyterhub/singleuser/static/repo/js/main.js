// Initialize GenePattern global variables
var GenePattern = GenePattern || {};
GenePattern.repo = GenePattern.repo || {};
GenePattern.repo.events_init = GenePattern.repo.events_init || false;
GenePattern.repo.public_notebooks = GenePattern.repo.public_notebooks || [];
GenePattern.repo.my_nb_paths = GenePattern.repo.my_nb_paths || [];

// TODO: FIXME get the real username
var username = 'thorin';

require(['base/js/namespace', 'jquery'], function(Jupyter, $) {
    "use strict";

    // Load css
    $('head').append(
        $('<link rel="stylesheet" type="text/css" />')
            .attr("rel", "stylesheet")
            .attr("type", "text/css")
            .attr('href', '/static/repo/css/repo.css')
    );

    // Function to call when sharing a notebook
    function share_selected() {
        alert("WORKS!");
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
                                $('<i class="item_icon notebook_icon icon-fixed-width repo-icon"></i>')
                            )
                            .append(nb['owner'])
                            .append(' / ')
                            .append(nb['name'])
                            .append('<br/>')
                            .append(nb['description'])
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
                        $('<i title="Shared to Repository" class="item_icon icon-fixed-width fa fa-share-square pull-right"></i>')
                    )
                }
            })
        });
    }
});