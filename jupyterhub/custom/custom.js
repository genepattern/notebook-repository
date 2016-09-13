/**
 * Use require.js to load the static GenePattern Notebook Repository files
 */
require(['base/js/namespace', 'jquery', 'repo/js/main'], function(Jupyter, $, repo) {
    "use strict";

    var username =  (""+ window.location).split('/')[4];
    $('#logout').html( "Logout " + username);

    console.log("GenePattern Notebook Repository code loaded.");
});