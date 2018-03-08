 require(['jquery'], function($) {
     "use strict";

     $(document).ready(function() {
         function get_cookie(name) {
             const nameEQ = name + "=";
             const ca = document.cookie.split(';');
             for (let i = 0; i < ca.length; i++) {
                 let c = ca[i];
                 while (c.charAt(0) === ' ') c = c.substring(1, c.length);
                 if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
             }
             return null;
         }

         function username_from_cookie(cookie) {
             // Handle the null case
             if (!cookie) return null;

             // Parse the cookie
             const parts = cookie.split("|");
             if (parts.length > 1) return parts[0];

             // Cookie not in the expected format
             else return null;
         }

         function get_username() {
             // Try the GenePattern repository cookie
             let genepattern_cookie = get_cookie("GenePattern");
             let username = username_from_cookie(genepattern_cookie);

             // Failing this, try the gpnb-username cookie
             if (!username) username = get_cookie("gpnb-username");

             return username;
         }

         function replace_cell(img, cell) {
             // Hide the code
             cell.find(".input").hide();

             // Display the widget
             const widget_area = cell.find(".output_widget_view");
             const base_url = "https://notebook.genepattern.org/hub/static/images/";

             const image = $('<img src="' + base_url + img + '" alt="GenePattern Authentication Cell" />');
             const div = $("<div></div>").append(image);

             widget_area.empty();
             widget_area.append(div);
         }

         function replace_auth_cells(code, cell) {
             // If this is an auth cell
             if (code.indexOf("genepattern.GPAuthWidget(") >= 0) {
                 replace_cell('auth-cell.jpg', cell);
             }
         }

         function replace_task_cells(code, cell) {
             // If this is a task cell
             if (code.indexOf("genepattern.GPTaskWidget(") >= 0) {
                 replace_cell('analysis-cell.jpg', cell);
             }
         }

         function replace_job_cells(code, cell) {
             // If this is a job cell
             if (code.indexOf("genepattern.GPJobWidget(") >= 0) {
                 replace_cell('job-cell.jpg', cell);
             }
         }

         function replace_ui_cells(code, cell) {
             // If this is a ui builder cell
             if (code.indexOf("@genepattern.build_ui(") >= 0 || code.indexOf("GPUIBuilder(") >= 0) {
                 replace_cell('ui-cell.jpg', cell);
             }
         }

         // Get the username, if logged in
         const username = get_username();

         // If logged in, change Run in GenePattern link
         if (!!username) {
             // replace_run_button(username)
         }

         // Display the widgets
         $(".cell").each(function (i, e) {
             const code = $(e).find(".input_area").text();
             replace_auth_cells(code, $(e));
             replace_task_cells(code, $(e));
             replace_job_cells(code, $(e));
             replace_ui_cells(code, $(e));
         });
     });
 });