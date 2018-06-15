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
<script src="https://notebook.genepattern.org/hub/static/js/preview.js"></script>

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

.gp-widget-auth .panel-heading,
.gp-widget-task .panel-heading,
.gp-widget-auth .btn-primary,
.gp-widget-task .btn-primary {
    background-color: rgba(10, 45, 105, 0.80);
    color: white;
}

.gp-widget-call .panel-heading,
.gp-widget-call .btn-primary {
    background-color: rgba(43, 43, 43, 0.8);
    color: white;
}

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
          <a id="run_notebook" href="https://notebook.genepattern.org" class="btn btn-sm btn-default navbar-btn">Login or Register</a>
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

{% block codecell %}
    {% if cell['metadata'].get('genepattern') %}

        {% if cell['metadata'].get('genepattern', {}).get('type', '') == 'auth' %}
            <div class="p-Widget panel panel-primary gp-widget gp-widget-auth">
                <div class="panel-heading">
                    <img class="gp-widget-logo" style="height: 20px;" src="https://notebook.genepattern.org/hub/static/images/GP_logo_on_black.png">
                    <h3 class="panel-title" style="display: inline-block; position: relative; top: 3px; padding-left: 10px;"><span class="widget-username-label">Login</span></h3>
                </div>
                <div class="panel-body widget-view">
                    <div class="gp-widget-auth-form">
                        <div class="form-group">
                            <label for="server">GenePattern Server</label>
                            <select class="form-control" name="server" type="text" style="margin-left: 0px;" disabled>
                                <option value="https://genepattern.broadinstitute.org/gp" selected="selected">Broad Institute</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="username">GenePattern Username</label>
                            <input class="form-control" name="username" placeholder="Username" required="required" autocomplete="off" type="text" disabled>
                        </div>
                        <div class="form-group">
                            <label for="password">GenePattern Password</label><input class="form-control" name="password" placeholder="Password" autocomplete="off" type="password" disabled>
                        </div>
                        <button class="btn btn-primary gp-auth-button">Log into GenePattern</button> <button class="btn btn-default">Register an Account</button></div></div></div>

        {% elif cell['metadata'].get('genepattern', {}).get('type', '') == 'task' or cell['metadata'].get('genepattern', {}).get('type', '') == 'uibuilder' %}
            <div class="p-Widget panel panel-primary gp-widget gp-widget-{% if cell['metadata'].get('genepattern', {}).get('type', '') == 'uibuilder' %}call{% else %}task{% endif %} gp-server-public">
                <div class="panel-heading gp-widget-task-header">
                    <img class="gp-widget-logo" style="height: 20px;" src="https://notebook.genepattern.org/hub/static/images/GP_logo_on_black.png">
                    <h3 class="panel-title" style="display: inline-block; position: relative; top: 3px; padding-left: 10px;"><span class="gp-widget-task-name"> {{ cell['metadata'].get('genepattern', {}).get('name', 'Analysis Module') }}</span></h3>
                </div>
                <div class="panel-body" style="position: relative;">
                    <div class="gp-widget-task-subheader" style="margin-bottom: 20px;">
                        <div class="gp-widget-task-run" style="float: right;"><button class="btn btn-primary gp-widget-task-run-button">Run</button></div>
                        <div class="gp-widget-task-desc">{{ cell['metadata'].get('genepattern', {}).get('description', 'Performs an analysis on the GenePattern server.') }}</div>
                        <div style="clear: both;"></div>
                    </div>
                    <div class="form-horizontal gp-widget-task-form">
                        <div class="gp-widget-task-group" style="margin-bottom: 10px;">
                            <div class="gp-widget-task-group-params" style="display: block;">
                                {% for key in cell['metadata'].get('genepattern', {}).get('param_values', {}).keys()|sort %}
                                    <div class="form-group gp-widget-task-param gp-widget-task-required">
                                        <label class="col-sm-3 control-label gp-widget-task-param-name">{{ key }}</label>
                                        <div class="col-sm-9 gp-widget-task-param-wrapper" style="padding: 0 20px;">
                                            <div class="gp-widget-task-param-input text-widget"><input class="form-control text-widget-input" type="text" value="{{ cell['metadata'].get('genepattern', {}).get('param_values', {})[key] }}" disabled></div>
                                        </div>
                                    </div>
                                {% endfor %}
                            </div>
                        </div>
                    </div>
                    <div class="gp-widget-task-footer" style="float: right;">
                        <div class="gp-widget-task-run"><button class="btn btn-primary gp-widget-task-run-button">Run</button></div><div style="clear: both;"></div>
                    </div>
                </div>
            </div>
        {% endif %}
    {% else %}
        <div class="cell border-box-sizing code_cell rendered">
            {{ super() }}
        </div>
    {% endif %}

{% endblock codecell %}

{% block footer %}
{{ super() }}
</html>
{% endblock footer %}