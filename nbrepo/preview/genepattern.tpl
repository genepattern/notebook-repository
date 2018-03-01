{%- extends 'basic.tpl' -%}
{% from 'mathjax.tpl' import mathjax %}


{%- block header -%}
<!DOCTYPE html>
<html>
<head>
{%- block html_head -%}
<meta charset="utf-8" />
{% set nb_title = nb.metadata.get('title', '') or resources['metadata']['name'] %}
<title>{{nb_title}}</title>

{%- if "widgets" in nb.metadata -%}
<script src="https://unpkg.com/jupyter-js-widgets@2.0.*/dist/embed.js"></script>
{%- endif-%}

<script src="https://cdnjs.cloudflare.com/ajax/libs/require.js/2.1.10/require.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/2.0.3/jquery.min.js"></script>

{% for css in resources.inlining.css -%}
    <style type="text/css">
    {{ css }}
    </style>
{% endfor %}

<style type="text/css">
/* Overrides of notebook CSS for static HTML export */
body {
  overflow: visible;
  padding: 8px;
}
div#notebook {
  overflow: visible;
  border-top: none;
}
{%- if resources.global_content_filter.no_prompt-%}
div#notebook-container{
  padding: 6ex 12ex 8ex 12ex;
}
{%- endif -%}
@media print {
  div.cell {
    display: block;
    page-break-inside: avoid;
  }
  div.output_wrapper {
    display: block;
    page-break-inside: avoid;
  }
  div.output {
    display: block;
    page-break-inside: avoid;
  }
}
</style>

<!-- Custom stylesheet, it must be in the same directory as the html file -->
<link rel="stylesheet" href="custom.css">

<!-- Loading mathjax macro -->
{{ mathjax() }}
{%- endblock html_head -%}
</head>
{%- endblock header -%}

{% block body %}
<body style="padding: 0; overflow: hidden;">

<div id="header" style="display: block; background: url('https://notebook.genepattern.org/hub/static/images/aurora5.png') center center; padding: 0 15px 5px 15px;">
    <div id="header-container" class="container">
      <div id="ipython_notebook" class="nav navbar-brand">
          <a href="https://notebook.genepattern.org" title="dashboard">
              <img src="https://notebook.genepattern.org/hub/logo" alt="GenePattern Notebook">
          </a>
      </div>
      <span id="save_widget" class="save_widget">
          <span id="notebook_name" class="filename" style="position: relative; top: 9px; color: white;">READ-ONLY PREVIEW</span>
      </span>

      <span class="flex-spacer"></span>
      <span id="login_widget">
          <a id="run_notebook" href="https://notebook.genepattern.org" class="btn btn-sm btn-default navbar-btn">Run in GenePattern Notebook</a>
      </span>
      <span>
          <a href="../download/" class="btn btn-default btn-sm navbar-btn pull-right" style="margin-right: 4px; margin-left: 2px;">
              Download
          </a>
      </span>
    </div>
    <div class="header-bar" style="background: none;"></div>
</div>


  <div tabindex="-1" id="notebook" class="border-box-sizing" style="display: block; height: 340px; overflow: auto;">
    <div class="container" id="notebook-container" style="margin-bottom: 100px;">
{{ super() }}
    </div>
  </div>
</body>
{%- endblock body %}

{% block footer %}
{{ super() }}
    <script type="text/javascript">
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
            const base_url = window.location.protocol + '//' + window.location.hostname + '/user/' +  get_username() + '/static/repo/img/';
            widget_area.empty();
            widget_area.append($('<img src="' + base_url + img + '" alt="GenePattern Authentication Cell" />'))
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

        function replace_run_button(username) {
            // Get the base URL
            const base_url = window.location.protocol + '//' + window.location.hostname + ':8080';

            // Remove the old link
            $("#run_notebook").attr("href", "#");

            // Attach the new click event
            $("#run_notebook").click(function() {
                $.ajax({
                    url: base_url + "/notebooks/" + 72 + "/copy/",
                    method: "POST",
                    beforeSend: function (xhr) {
                        // xhr.setRequestHeader("Authorization", "Token " + GenePattern.repo.token);
                    },
                    success: function(responseData) {
                        // Redirect to the notebook
                    }
                });
            });
        }

        // Get the username, if logged in
        const username = get_username();

        // If logged in, change Run in GenePattern link
        if (!!username) {
            // replace_run_button(username)
        }

        // Display the widgets
        $(".cell").each(function(i, e) {
            const code = $(e).find(".input_area").text();
            replace_auth_cells(code, $(e));
            replace_task_cells(code, $(e));
            replace_job_cells(code, $(e));
            replace_ui_cells(code, $(e));
        })
    </script>
</html>
{% endblock footer %}