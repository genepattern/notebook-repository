
require(['base/js/namespace', 'jquery', 'base/js/dialog', 'hints/js/intro.min'], function(Jupyter, $, dialog, introJs) {
    "use strict";

    /**
     * Build and display the hints button
     */
    function display_hints() {
        $("body").append(
            $("<div></div>")
                .attr("id", "gp-hint-box")
                .attr("title", "Welcome to the GenePattern Notebook Repository")
                .append(
                    $("<i class='fa fa-info' aria-hidden='true'></i>")
                )
                .click(function() {
                    dialog.modal({
                        title : "Welcome to the GenePattern Notebook Repository",
                        body : $("<div></div>")
                            .append(
                                $("<iframe></iframe>")
                                    .css("height", $(window).height() - 300)
                                    .css("width", "100%")
                                    .attr("src", Jupyter.notebook_list.base_url + "static/hints/html/hints.html")
                            ),
                        buttons: {
                            "Take a Tour!": {
                                "class": "btn-info",
                                "click": webtour
                            },
                            "OK": {
                                "class": "btn-primary",
                                "click": function () {}
                            }
                        }
                    });
                })
        );
    }

    /***********************************
     * Begin webtour functionality     *
     ***********************************/
    function webtour() {
        // Get a refernece to the intro.js instance
        const intro = introJs();

        // Define each of the steps of the tour
        intro.setOptions({
            steps: [
                {   // STEP 0
                    intro: "<h4>Welcome to the GenePattern Notebook Repository</h4>" +
                        "GenePattern provides hundreds of analytical tools for the analysis of gene expression (RNA-seq and microarray), sequence variation and copy number, proteomic, flow cytometry, and network analysis - all with a user-friendly interface!"
                },
                {   // STEP 1
                    element: document.querySelectorAll('.repository_tab_link')[0],
                    intro: "<h4>Notebook Library</h4>" +
                        "The GenePattern Notebook Repository provides a library of public notebooks, which can serve as templates or examples when creating your own. These notebooks can be accessed from the <em>Notebook Library</em> tab."
                },
                {   // STEP 2
                    element: document.querySelectorAll('[data-tag=featured]')[0],
                    intro: "<h4>Featured Notebooks</h4>" +
                        "Public notebooks are tagged and divided into several different categories. Featured notebooks have been selected because they demonstrate interesting biologic, bioinformatic or machine learning methods."
                },
                {   // STEP 3
                    element: document.querySelectorAll('[data-tag=tutorial]')[0],
                    intro: "<h4>Tutorial Notebooks</h4>" +
                        "Tutorial notebooks teach how to use different GenePattern Notebook features, including advanced programmatic features."
                },
                {   // STEP 4
                    element: document.querySelectorAll('#repo-sidebar-nav [data-tag=""]')[0],
                    intro: "<h4>Community Notebooks</h4>" +
                        "Finally, community notebooks are those that have been contributed by the GenePattern Notebook community."
                },
                {   // STEP 5
                    element: document.querySelectorAll('[data-tag="-shared-by-me"]')[0],
                    intro: "<h4>Shared Notebooks</h4>" +
                        "In addition to the public notebooks, the <em>Notebook Library</em> tab also contains those that you have shared with specific collaborators or which have been shared with you. If this option is empty, it is because you haven't shared a notebook with anyone yet.",
                    position: "right"
                },
                {   // STEP 6
                    element: document.querySelectorAll('a[href="#notebooks"]')[0],
                    intro: "<h4>Personal Workspace</h4>" +
                        "The <em>Files</em> tab contains your personal workspace. Listed here are notebooks or other files which are private to your account Here you can create new notebooks, upload files or organize your file into folders."
                },
                {   // STEP 7
                    element: document.querySelectorAll('#notebook_list')[0],
                    intro: "<h4>Opening Notebooks</h4>" +
                        "To open an existing notebook, simply click on the notebook in the list. This will open the notebook in a new tab."
                },
                {   // STEP 8
                    element: document.querySelectorAll('#new-buttons')[0],
                    intro: "<h4>Creating New Notebooks</h4>" +
                        "To create a new blank notebook, click on the <em>New</em> menu and select <em>Notebook</em> in the list. There are also options here for creating new text files, folders and terminal sessions.",
                    position: "left"
                },
                {   // STEP 9
                    element: document.querySelectorAll('#alternate_upload')[0],
                    intro: "<h4>Uploading Files</h4>" +
                        "To upload a file click the <em>Upload</em> button and then select the file that you wish to upload to your personal workspace."
                },
                {   // STEP 10
                    element: document.querySelectorAll('.dynamic-buttons')[0],
                    intro: "<h4>Working With Files</h4>" +
                        "When a file is selected, a menu of options will display here. This menu allows you to rename, move and delete files."
                },
                {   // STEP 11
                    element: document.querySelectorAll('.dynamic-buttons')[0],
                    intro: "<h4>Sharing & Publishing</h4>" +
                        "Finally, when you select a notebook, options will appear allowing you to <em>share</em> this notebook with others or to <em>publish</em> it as a public notebook."
                }
            ]
        });

        // Perform necessary transitions between steps
        intro.onbeforechange(function(element) {
            //switch the active tab to the appropriate one for the step
            if (intro._currentStep === 1) $('.repository_tab_link').click();

            // Switch to the files tab
            else if (intro._currentStep === 6) $("#tabs a:first").click();

            // Select a notebook
            else if (intro._currentStep === 9) {
                $('.item_icon.notebook_icon.icon-fixed-width:first').parent().find('input[type=checkbox]').click();
            }
        });

        // Launch the tour
        intro.start();
    }

    function check_webtour() {
        $.ajax({
            url: GenePattern.repo.repo_url + "/webtours/" + GenePattern.repo.username + "/",
            method: "GET",
            crossDomain: true,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
            },
            success: function (data) {
                if (!data['seen']) webtour();
                else console.log("Webtour already seen");
            },
            error: function() {
                console.log("ERROR: Attempting to check webtour");
            }
        });
    }

    /***********************************
     * Initialize the hints & webtour  *
     ***********************************/

    const on_index_page = $("#notebooks").is(":visible");
    if (on_index_page) display_hints();
    $(document).on("gp.repo.auth", check_webtour);
});