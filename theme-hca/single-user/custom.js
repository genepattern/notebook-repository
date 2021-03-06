/**
 * Use require.js to load the static GenePattern Notebook Repository files
 */
require(['base/js/namespace', 'jquery', 'repo/js/main', 'hints/js/main'], function(Jupyter, $, repo, hints) {
    "use strict";

	// Add username to the logout button
    var username =  (""+ window.location).split('/')[4];
    $('#logout').html( "Logout " + username);

	/**
	 * Attaches the loading screen
	 *
	 * @returns {*|jQuery}
	 */
	var loadingScreen = function() {
	    var base_url = Jupyter.contents ? Jupyter.contents.base_url : (Jupyter.notebook_list ? Jupyter.notebook_list.base_url : Jupyter.editor.base_url);
	    var STATIC_PATH = location.origin + base_url + "nbextensions/genepattern/resources/";
		return $("<div></div>")
			.addClass("loading-screen")
			.append("Please wait while GenePattern Notebook is loading...")
			.append($("<br/><br/>"))
			.append(
				$("<img/>")
					.attr("src", "/hub/logo")
			);
	};

    // Add the loading screen if this is a notebook
    if (Jupyter.notebook) {
        $("body").append(loadingScreen());
    }

    // Fade the loading screen when the kernel is ready
    $([Jupyter.events]).on('kernel_ready.Kernel', function() {
        $(".loading-screen").hide("fade");
    });

    // Backup attempt to fade loading screen
    setTimeout(function () {
        $(".loading-screen").hide("fade");
    }, 10000);


    console.log("GenePattern Notebook Repository code loaded.");
});