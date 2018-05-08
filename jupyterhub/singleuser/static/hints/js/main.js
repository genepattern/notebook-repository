
require(['base/js/namespace', 'jquery', 'base/js/dialog'], function(Jupyter, $, dialog) {
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
                    $("<i class='fa fa-lightbulb-o' aria-hidden='true'></i>")
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
                            "OK": {
                                "class": "btn-primary",
                                "click": function () {}
                            }
                        }
                    });
                })
        );

        // If there are only the two default notebooks, open the hint dialog
        const notebook_count = $("#notebook_list").find(".list_item.row").length;
        if (notebook_count === 2) $("#gp-hint-box").click();
    }

    const on_index_page = $("#notebooks").is(":visible");
    if (on_index_page) display_hints();
});