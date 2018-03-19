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

{% block footer %}
{{ super() }}
</html>
{% endblock footer %}