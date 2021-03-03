var GenePattern = GenePattern || {};
GenePattern.projects = GenePattern.projects || {};
GenePattern.projects.username = GenePattern.projects.username || [];
GenePattern.projects.base_url = GenePattern.projects.base_url || '';
GenePattern.projects.images = GenePattern.projects.images || [];
GenePattern.projects.new_project = GenePattern.projects.new_project || null;
GenePattern.projects.my_projects = GenePattern.projects.my_projects || [];


class Project {
    element = null;
    model = null;
    template = `
        <div class="panel nb-project">
            <div class="nb-icon-space">
                <i title="Shared" class="fa fa-share nb-shared-icon hidden"></i>
                <i title="Published" class="fa fa-newspaper-o nb-published-icon hidden"></i>
            </div>
            <div class="dropdown nb-gear-menu">
                <button type="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" class="btn btn-default dropdown-toggle">
                    <i title="Options" class="fa fa-cog"></i>
                    <i title="Dropdown" class="caret"></i>
                </button>
                <ul class="dropdown-menu">
                    <li><a href="#" class="dropdown-item nb-edit">Edit</a></li>
                    <li><a href="#" class="dropdown-item nb-publish">Publish</a></li>
                    <li class="hidden"><a href="#" class="dropdown-item nb-share">Share</a></li>
                    <li><a href="#" class="dropdown-item nb-stop">Stop</a></li>
                    <li><a href="#" class="dropdown-item nb-delete">Delete</a></li>
                </ul>
            </div>
            <img src="/static/images/background.jpg" alt="Project Icon" class="img-responsive nb-img-top">
            <div class="panel-body">
                <h8 class="panel-title"></h8>
                <p class="panel-text"></p>
                <div class="panel-text nb-tags"></div>
            </div>
        </div>`;

    constructor(project_json) {
        this.model = project_json;
        this.build();
        this.init_events();
    }

    build() {
        // Parse the template
        this.element = new DOMParser().parseFromString(this.template, "text/html")
            .querySelector('div.nb-project');

        // Mark as active or stopped
        if (!this.model.active) this.element.classList.add('nb-stopped');

        // Display name and other metadata
        this.element.querySelector('.panel-title').innerHTML = this.display_name();
        this.element.querySelector('.panel-text').innerHTML = this.description();

        // Display the tags
        this._apply_tags();
    }

    init_events() {
        // Handle click events on projects
        $(this.element).click((event) => {
            // Ignore clicks on the gear menu, If any other project is clicked
            if (!$(event.target).closest('.dropdown').length) this.open_project();
        });

        // Handle menu clicks
        $(this.element).find('.nb-stop').click((event) => this.stop_project());
        $(this.element).find('.nb-delete').click((event) => this.delete_project());
        $(this.element).find('.nb-edit').click((event) => this.edit_project());
        $(this.element).find('.nb-publish').click((event) => this.publish_project());
    }

    display_name() {
        return this.model.display_name || this.model.slug;
    }

    description() {
        return this.model.description || this.model.last_activity;
    }

    slug() {
        this.model.slug;
    }

    image() {
        return this.model.image;
    }

    get_url() {
        return `/user/${GenePattern.projects.username}/${this.model.slug}`;
    }

    api_url() {
        return `${GenePattern.projects.base_url}api/users/${GenePattern.projects.username}/servers/${this.model.slug}`;
    }

    _apply_tags() {
        let tag = document.createElement('span');
        tag.classList.add('badge', 'badge-secondary');
        tag.innerHTML = this.model.image || 'Unknown';
        this.element.querySelector('.nb-tags').append(tag);
    }

    publish_project() {
        // TODO: Implement
    }

    edit_project() {
        // Lazily create the edit dialog
        if (!this.edit_dialog)
            this.edit_dialog = new Modal('edit-project-dialog', {
                title: 'Edit Project',
                body: project_form_spec(this),
                button_label: 'Save',
                button_class: 'btn-warning edit-button',
                callback: (form_data) => {
                    // Make the AJAX request
                    $.ajax({
                        method: 'POST',
                        url: this.api_url(),
                        contentType: 'application/json',
                        data: JSON.stringify({
                            "name": form_data['name'],
                            "image": form_data['image'],
                            "description": form_data['description']
                        }),
                        success: () => redraw_projects(),
                        error: () => error_message('Unable to edit project.')
                    });
                }
            });

        // Show the delete dialog
        this.edit_dialog.show();
    }

    stop_project() {
        $.ajax({
            method: 'DELETE',
            url: this.api_url(),
            contentType: 'application/json',
            data: '{ "remove": false }',
            success: () => this.element.classList.add('nb-stopped'),
            error: () => error_message('Unable to stop project.')
        });
    }

    delete_project() {
        // Lazily create the delete dialog
        if (!this.delete_dialog)
            this.delete_dialog = new Modal('delete-project-dialog', {
                title: 'Delete Project',
                body: '<p>Are you sure that you want to delete this project?</p>',
                button_label: 'Delete',
                button_class: 'btn-danger delete-button',
                callback: () => {
                    // Make the call to delete the project
                    $.ajax({
                        method: 'DELETE',
                        url: this.api_url(),
                        contentType: 'application/json',
                        data: '{ "remove": true }',
                        success: () => $(this.element).remove(),
                        error: () => error_message('Unable to delete project.')
                    });
                }
            });

        // Show the delete dialog
        this.delete_dialog.show();
    }

    open_project(callback) {
        // If a custom callback is not defined, use the default one
        if (!callback) callback = () => {
            // Open the project in a new tab
            window.open(this.get_url());
        };

        let running = !this.element.classList.contains('nb-stopped');
        if (running) { // If running, just open a new tab
            callback(this);
        }
        else { // Otherwise, launch the server
            // Make the AJAX request
            $.ajax({
                method: 'POST',
                url: this.api_url(),
                contentType: 'application/json',
                data: JSON.stringify({
                    "name": this.display_name(),
                    "image": this.image(),
                    "description": this.description()
                }),
                success: () => {},
                error: () => error_message('Unable to edit project.')
            });
            setTimeout(() => {
                callback(this);
            }, 500);

            this.element.classList.remove('nb-stopped'); // Mark as running
        }
    }
}

class NewProject {
    element = null;
    template = `
        <div class="panel nb-project nb-project-new">
            <div class="nb-img-top">
                <i class="fa fa-plus-circle nb-project-icon"></i>
            </div>
            <div class="panel-body">
                <h8 class="panel-title">New Project</h8>
                <p class="panel-text">Create a New Notebook Project</p>
            </div>
        </div>
    `;

    constructor() {
        this.build();
        this.init_events();
    }

    build() {
        // Parse the template
        this.element = new DOMParser().parseFromString(this.template, "text/html")
            .querySelector('div.nb-project-new');
    }

    init_events() {
        // Handle click events on new project
        $(this.element).click(() => this.new_project_dialog());
    }

    get_url() {
        return `/user/${GenePattern.projects.username}/`;
    }

    api_url() {
        return `${GenePattern.projects.base_url}api/users/${GenePattern.projects.username}/servers/`;
    }

    project_exists(slug) {
        let found_name = false;
        GenePattern.projects.my_projects.forEach(project => {
            if (project.slug() === slug) {
                found_name = true;
                return false;
            }
        });
        return found_name;
    }

    new_project_dialog(project) {
        // Lazily create the new project dialog
        if (!this.project_dialog)
            this.project_dialog = new Modal('new-project-dialog', {
                title: 'Create New Project',
                body: project_form_spec(),
                button_label: 'Create Project',
                button_class: 'btn-success create-button',
                callback: (form_data) => {
                    // Generate the slug
                    let slug = form_data['name'].toLowerCase().replace(/[^A-Z0-9]+/ig, "_");
                    if (slug.endsWith('_')) slug += 'project';  // Swarm doesn't like slugs that end in an underscore

                    // Make sure there isn't already a project named this
                    if (this.project_exists(slug)) {
                        error_message('Please choose a different name. A project already exists with that name.');
                        return;
                    }

                    // Make the AJAX request
                    $.ajax({
                        method: 'POST',
                        url: this.api_url() + slug,
                        contentType: 'application/json',
                        data: JSON.stringify({
                            "name": form_data['name'],
                            "image": form_data['image'],
                            "description": form_data['description']
                        }),
                        success: () => {
                            // Open the project and refresh the page
                            window.open(this.get_url() + slug);
                            redraw_projects();
                        },
                        error: () => error_message('Unable to create project.')
                    });
                }
            });

        // Show the delete dialog
        this.project_dialog.show();
    }
}

class Modal {
    element = null;
    id = null;
    title = null;
    body = null;
    footer = null;
    callback = null;
    template = `
        <div class="modal fade" tabindex="-1" role="dialog" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal">
                            <span aria-hidden="true">&times;</span>
                            <span class="sr-only">Close</span>
                        </button>
                        <h4 class="modal-title"></h4>
                    </div>
                    <div class="modal-body"></div>
                    <div class="modal-footer"></div>
                </div>
            </div>
        </div>`;

    constructor(id, { title = null, body = '', buttons = null, button_label = 'OK', button_class = 'btn-primary', callback = () => {} } = {}) {
        this.id = id;
        this.title = title || id;
        this.body = typeof body === 'string' ? body : this.form_builder(body);
        this.footer = buttons || this.default_buttons(button_label, button_class);
        this.callback = callback;
        this.build();
        this.attach_callback();
    }

    build() {
        // Parse the template
        this.element = new DOMParser().parseFromString(this.template, "text/html")
            .querySelector('div.modal');

        this.element.setAttribute('id', this.id);                               // Set the id
        this.element.querySelector('.modal-title').innerHTML = this.title;      // Set the title
        this.element.querySelector('.modal-body').innerHTML = this.body;        // Set the body
        this.element.querySelector('.modal-footer').innerHTML = this.footer;    // Set the footer
    }

    show() {
        const attached = document.body.querySelector(`#${this.id}`);
        if (attached) attached.remove();                                        // Remove old dialog, if one exists
        document.body.append(this.element);                                     // Attach this modal dialog
        $(this.element).modal();                            // Display the modal dialog using JupyterHub's modal call
    }

    form_builder(body_spec) {
        // Assume body is a list of objects
        // {
        //     label: str,
        //     name: str,
        //     required: boolean,
        //     value: str,
        //     options: list
        // }
        const form = $('<div class="form-horizontal"></div>');
        body_spec.forEach((param) => {
            const grouping = $('<div class="form-group"></div>');
            const asterisk = param['required'] ? '*' : '';
            grouping.append($(`<label for="${param['name']}" class="control-label col-sm-4">${param['label']}${asterisk}</label>`));
            if (!param['options'] || !param['options'].length) {        // Handle text parameters
                grouping.append($(`<div class="col-sm-8"><input name="${param['name']}" type="text" class="form-control" value="${param['value']}" /></div>`));
            }
            else {                                                      // Handle select parameters
                const div = $('<div class="col-sm-8"></div>');
                const select = $(`<select name="${param['name']}" class="form-control"></select>`).appendTo(div);
                param['options'].forEach((option) => {
                    if (option === param['value']) select.append($(`<option value="${option}" selected>${option}</option>`))
                    else select.append($(`<option value="${option}">${option}</option>`))
                });
                grouping.append(div);
            }
            form.append(grouping);
        });
        return form[0].outerHTML;
    }

    default_buttons(button_label, button_class) {
        return `
            <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
            <button type="button" class="btn ${button_class}" data-dismiss="modal">${button_label}</button>`;
    }

    gather_form_data() {
        const form_data = {};
        const inputs = this.element.querySelectorAll('input, select');
        inputs.forEach(i => form_data[i.getAttribute('name')] = i.value);
        return form_data;
    }

    attach_callback() {
        // IMPLEMENT: Handle a list of callbacks for cases where there is more than one button in the footer
        const buttons = this.element.querySelector('.modal-footer').querySelectorAll('.btn');
        if (buttons.length) buttons[buttons.length - 1].addEventListener("click", () => {
            const form_data = this.gather_form_data();
            this.callback(form_data);
        });
    }
}

function project_form_spec(project = null) {
    return [
        {
            label: "Project Name",
            name: "name",
            required: true,
            value: project ? project.display_name() : ''
        },
        {
            label: "Environment",
            name: "image",
            required: true,
            value: project ? project.image() : '',
            options: GenePattern.projects.images
        },
        {
            label: "Description",
            name: "description",
            required: false,
            value: project ? project.description() : ''
        }
    ];
}

function query_projects() {
    function sort(a, b) {
        // Basic case-insensitive alphanumeric sorting
        const a_text = a.display_name().toLowerCase();
        const b_text = b.display_name().toLowerCase();
        if ( a_text < b_text ) return -1;
        if ( a_text > b_text ) return 1;
        return 0;
    }

    return fetch('/user.json')
        .then(response => response.json())
        .then(response => {
            GenePattern.projects.username = response['name'];
            GenePattern.projects.base_url = response['base_url'];
            GenePattern.projects.images = response['images'];
            GenePattern.projects.my_projects = [];                          // Clean the my_projects list
            response['projects'].forEach((p) => GenePattern.projects.my_projects.push(new Project(p)));
            GenePattern.projects.my_projects.sort(sort);                    // Sort the my_projects list
        })
}

function redraw_projects() {
    return query_projects().then(() => {
        document.querySelector('#projects').innerHTML = '';                     // Empty the projects div
        GenePattern.projects.my_projects.forEach((p) =>                              // Add the project widgets
            document.querySelector('#projects').append(p.element));

        // Add new project widget
        if (!GenePattern.projects.new_project) GenePattern.projects.new_project = new NewProject();
        document.querySelector('#projects').append(GenePattern.projects.new_project.element);
    });
}

function error_message(message) {
    $('#messages').append(
        $(`<div class="alert alert-danger">${message}</div>`)
    )
}

function initialize_search() {
    $('#nb-search').keyup((event) => {
        let search = $(event.target).val().trim().toLowerCase();

        // Display the matching projects
        const projects = $('#projects').find('.nb-project');
        projects.each(function(i, project) {
            project = $(project);

            // Matching notebook
            if (project.text().toLowerCase().includes(search)) project.removeClass('hidden');

            // Not matching notebook
            else project.addClass('hidden');
        });
    });
}

function initialize_buttons() {
    // Handle new project button click
    $('#nb-new').click(() => {
        GenePattern.projects.new_project.new_project_dialog($(".nb-project-new"));
    });
}

function initialize_refresh() {
    setInterval(redraw_projects, 1000 * 60);                        // Refresh the list every minute
}

function __init_projects__() {
    initialize_search();            // Initialize the search box
    initialize_buttons();           // Initialize the new project button
    redraw_projects();              // Add the projects to the page
    initialize_refresh();           // Begin the periodic refresh
}
__init_projects__();