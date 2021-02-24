var GenePattern = GenePattern || {};
GenePattern.projects = GenePattern.projects || {};
GenePattern.projects.username = GenePattern.projects.username || [];
GenePattern.projects.base_url = GenePattern.projects.base_url || '';
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

    edit_project() {
        const edit_dialog = $('#edit-project-dialog').modal();
        const project_name = edit_dialog.find('[name=name]').val(this.display_name());
        const image = edit_dialog.find('[name=image]').val(this.image());
        const description = edit_dialog.find('[name=description]').val(this.description());

        edit_dialog.find(".edit-button").off('click').one('click', () => {
            // Make the AJAX request
            $.ajax({
                method: 'POST',
                url: this.api_url(),
                contentType: 'application/json',
                data: JSON.stringify({
                    "name": project_name.val(),
                    "image": image.val(),
                    "description": description.val()
                }),
                success: () => redraw_projects(),
                error: () => error_message('Unable to edit project.')
            });
        });
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
        $('#delete-project-dialog').modal()
            .find(".delete-button").off('click').one('click', () => {
                // Make the call to delete the project
                $.ajax({
                    method: 'DELETE',
                    url: this.api_url(),
                    contentType: 'application/json',
                    data: '{ "remove": true }',
                    success: () => $(this.element).remove(),
                    error: () => error_message('Unable to delete project.')
                });
            });
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

        // Apply data attributes
        this.element.dataset.get = `/user/${GenePattern.projects.username}/`;
        this.element.dataset.api = `${GenePattern.projects.base_url}api/users/${GenePattern.projects.username}/servers/`;
    }

    init_events() {
        // Handle click events on new project
        $(this.element).click((event) => {
            this.new_project_dialog($(event.currentTarget));
        });
    }

    project_exists(project_name) {
        const project_nodes = $("#projects > .nb-project");
        let found_name = false;
        project_nodes.each((i, e) => {
            const safe_name = $(e).data('safename');
            if (project_name === safe_name) {
                found_name = true;
                return false;
            }
        });
        return found_name;
    }

    new_project_dialog(project) {
        const create_dialog = $('#create-new-project-dialog');
        create_dialog.modal()
            .find(".create-button").off('click').one('click', () => {
                // Get the form data
                const api_url = project.data('api');
                const get_url = project.data('get');
                const project_name = create_dialog.find('[name=name]').val();
                const safe_name = project_name.toLowerCase().replace(/[^A-Z0-9]+/ig, "_");
                const image = create_dialog.find('[name=image]').val();
                const description = create_dialog.find('[name=description]').val();

                // Make sure there isn't already a project named this
                if (this.project_exists(safe_name)) {
                    error_message('Please choose a different name. A project already exists with that name.');
                    return;
                }

                // Make the AJAX request
                $.ajax({
                    method: 'POST',
                    url: api_url + safe_name,
                    contentType: 'application/json',
                    data: JSON.stringify({
                        "name": project_name,
                        "image": image,
                        "description": description
                    }),
                    success: () => {
                        // Open the project and refresh the page
                        window.open(get_url + safe_name);
                        redraw_projects();
                    },
                    error: () => error_message('Unable to create project.')
                });
            });
    }
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