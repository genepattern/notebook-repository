var GenePattern = GenePattern || {};
GenePattern.projects = GenePattern.projects || {};
GenePattern.projects.username = GenePattern.projects.username || '';
GenePattern.projects.encoded_username = GenePattern.projects.encoded_username || '';
GenePattern.projects.base_url = GenePattern.projects.base_url || '';
GenePattern.projects.admin = GenePattern.projects.admin || false;
GenePattern.projects.images = GenePattern.projects.images || [];
GenePattern.projects.new_project = GenePattern.projects.new_project || null;
GenePattern.projects.my_projects = GenePattern.projects.my_projects || [];
GenePattern.projects.library = GenePattern.projects.library || [];
GenePattern.projects.pinned_tags = GenePattern.projects.pinned_tags || [];
GenePattern.projects.protected_tags = GenePattern.projects.protected_tags || [];
GenePattern.projects.shared_with_me = GenePattern.projects.shared_with_me || [];
GenePattern.projects.shared_by_me = GenePattern.projects.shared_by_me || [];


class Project {
    element = null;
    model = null;
    published = null;
    shared = null;
    template = `
        <div class="panel nb-project">
            <div class="nb-image"></div>
            <div class="nb-icon-space">
                <i title="Shared" class="fa fa-users nb-shared-icon hidden"></i>
                <i title="Published" class="fa fa-newspaper-o nb-published-icon hidden"></i>
            </div>
            <div class="dropdown nb-gear-menu">
                <button type="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" class="btn btn-default dropdown-toggle">
                    <i title="Options" class="fa fa-cog"></i>
                    <i title="Dropdown" class="caret"></i>
                </button>
                <ul class="dropdown-menu"></ul>
            </div>
            <img src="/static/images/background.jpg" alt="Project Icon" class="img-responsive nb-img-top">
            <div class="panel-body">
                <p class="panel-title"></p>
                <p class="panel-text"></p>
                <div class="panel-text nb-tags"></div>
            </div>
        </div>`;

    constructor(project_json) {
        this.model = project_json;
        this.build();
    }

    build() {
        // Parse the template
        this.element = new DOMParser().parseFromString(this.template, "text/html")
            .querySelector('div.nb-project');

        // Mark as active or stopped
        if (!this.running()) this.element.classList.add('nb-stopped');

        // Display name and other metadata
        this.element.querySelector('.panel-title').innerHTML = this.display_name();
        this.element.querySelector('.panel-text').innerHTML = this.description();
        this.element.querySelector('.nb-image').innerHTML = this.image();
        this.element.querySelector('.nb-image').title = `This project uses the ${this.image()} environment.`;

        // Display the tags
        this._apply_tags();

        // Create the gear menu and attach events
        this.build_gear_menu();

        // Attach the click event to open a project, ignore clicks on the gear menu
        this.attach_default_click();
    }

    attach_default_click() {
        this.element.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown') &&
                !e.target.closest('.nb-published-icon') &&
                !e.target.closest('.nb-shared-icon')) this.open_project()
        });
    }

    build_gear_menu() {
        // Add the menu items
        $(this.element).find('.dropdown-menu')
            .append($('<li><a href="#" class="dropdown-item nb-edit">Edit</a></li>'))
            .append($('<li><a href="#" class="dropdown-item nb-publish">Publish</a></li>'))
            .append($('<li><a href="#" class="dropdown-item nb-share">Share</a></li>'))
            .append($('<li><a href="#" class="dropdown-item nb-stop">Stop</a></li>'))
            .append($('<li><a href="#" class="dropdown-item nb-delete">Delete</a></li>'));

        // Handle menu clicks
        $(this.element).find('.nb-stop').click(e => Project.not_disabled(e,() => this.stop_project()));
        $(this.element).find('.nb-delete').click(e => Project.not_disabled(e,() => this.delete_project()));
        $(this.element).find('.nb-edit').click(e => Project.not_disabled(e,() => this.edit_project()));
        $(this.element).find('.nb-publish').click(e => Project.not_disabled(e,() => this.publish_project()));
        $(this.element).find('.nb-share').click(e => Project.not_disabled(e,() => this.share_project()));

        // Handle publishing and sharing clucks
        $(this.element).find('.nb-published-icon').click(() => $(this.element).find('.nb-publish').click());
        $(this.element).find('.nb-shared-icon').click(() => $(this.element).find('.nb-share').click());

        // Enable or disable options
        this.update_gear_menu(this.running())
    }

    update_gear_menu(running=null) {
        if (running === null) running = this.running();

        // Enable or disable based on running status
        if (running) {
            $(this.element).find('.nb-edit').parent().addClass('disabled')
                .attr('title', 'You must stop this project before it may be edited.');
            $(this.element).find('.nb-publish').parent().addClass('disabled')
                .attr('title', 'You must stop this project before it may be published.');
            $(this.element).find('.nb-share').parent().addClass('disabled')
                .attr('title', 'You must stop this project before it may be shared.');
            $(this.element).find('.nb-stop').parent().removeClass('disabled')
                .removeAttr('title');
            $(this.element).find('.nb-delete').parent().addClass('disabled')
                .attr('title', 'You must stop this project before it may be deleted.');
        }
        else {
            $(this.element).find('.nb-edit').parent().removeClass('disabled')
                .removeAttr('title');
            $(this.element).find('.nb-publish').parent().removeClass('disabled')
                .removeAttr('title');
            $(this.element).find('.nb-share').parent().removeClass('disabled')
                .removeAttr('title');
            $(this.element).find('.nb-stop').parent().addClass('disabled')
                .attr('title', 'This project is already stopped.');
            $(this.element).find('.nb-delete').parent().removeClass('disabled')
                .removeAttr('title');
        }

        // Tooltip or rename based on published status
        if (this.published) {
            $(this.element).find('.nb-publish').text('Publishing');
            $(this.element).find('.nb-delete').parent().addClass('disabled')
                .attr('title', 'You must unpublish this project before it can be deleted.');
        }
        else {
            $(this.element).find('.nb-publish').text('Publish');
        }

        // Rename based on sharing status
        if (this.shared) {
            $(this.element).find('.nb-share').text('Sharing');
            $(this.element).find('.nb-delete').parent().addClass('disabled')
                .attr('title', 'You must unshare this project before it can be deleted.');
        }
        else {
            $(this.element).find('.nb-share').text('Share');
        }
    }

    display_name() {
        return (this.model.display_name || this.model.slug).toString();
    }

    description() {
        return (this.model.description || this.model.last_activity).toString();
    }

    slug() {
        return this.model.slug.toString();
    }

    image() {
        return this.model.image.toString();
    }

    author() {
        return this.model.author.toString() || '';
    }

    quality() {
        return this.model.quality.toString() || '';
    }

    citation() {
        return this.model.citation || '';
    }

    tags(str=false) {
        const clean_text = $('<textarea />').html(this.model.tags).text();  // Fix HTML encoding issues
        if (str) return clean_text;
        else if (clean_text === '') return [];
        else return clean_text.split(',');
    }

    running() {
        return this.model.active;
    }

    get_url() {
        return `/user/${GenePattern.projects.encoded_username}/${this.slug()}`;
    }

    api_url() {
        return `${GenePattern.projects.base_url}api/users/${GenePattern.projects.encoded_username}/servers/${this.slug()}`;
    }

    publish_url() {
        if (!this.published) return `/services/projects/library/`;  // Root endpoint if not published
        else this.published.publish_url();                          // Endpoint with /<id>/ if published
    }

    share_url() {
        if (!this.shared) return `/services/projects/sharing/`;     // Root endpoint if not published
        else this.shared.share_url();                               // Endpoint with /<id>/ if published
    }

    mark_published(published_project) {
        this.published = published_project;
        published_project.linked = this;
        this.element.querySelector('.nb-published-icon').classList.remove('hidden');
        this.update_gear_menu();
    }

    mark_shared(shared_project) {
        this.shared = shared_project;
        shared_project.linked = this;
        this.element.querySelector('.nb-shared-icon').classList.remove('hidden');
        this.update_gear_menu();
    }

    _apply_tags() {
        const tag_box = this.element.querySelector('.nb-tags');
        this.tags().forEach((t) => {
            let tag = document.createElement('span');
            tag.classList.add('badge');
            tag.innerHTML = t;
            tag_box.append(tag);
        });
    }

    publish_project() {
        // If this project is already published, show the update dialog instead
        if (this.published) return this.published.update_project();

        // Lazily create the publish dialog
        if (!this.publish_dialog)
            this.publish_dialog = new Modal('publish-project-dialog', {
                title: 'Publish Project',
                body: Project.project_form_spec(this, [], ['name', 'image', 'author', 'quality', 'description']),
                button_label: 'Publish',
                button_class: 'btn-warning publish-button',
                callback: (form_data) => {
                    Messages.show_loading();

                    // Make the AJAX request
                    $.ajax({
                        method: 'POST',
                        url: this.publish_url(),
                        contentType: 'application/json',
                        data: JSON.stringify({
                            "dir": this.slug(),
                            "image": form_data['image'],
                            "name": form_data['name'],
                            "description": form_data['description'],
                            "author": form_data['author'],
                            "quality": form_data['quality'],
                            "citation": form_data['citation'],
                            "tags": Project.tags_to_string(form_data['tags']),
                            "owner": GenePattern.projects.username
                        }),
                        success: () => {
                            Library.redraw_library(`Successfully published ${form_data['name']}`);

                            // Sync published metadata with personal project metadata
                            $.ajax({
                                method: 'POST',
                                url: this.api_url(),
                                contentType: 'application/json',
                                data: JSON.stringify({
                                    "name": form_data['name'],
                                    "image": form_data['image'],
                                    "description": form_data['description'],
                                    "author": form_data['author'],
                                    "quality": form_data['quality'],
                                    "citation": form_data['citation'],
                                    "tags": Project.tags_to_string(form_data['tags'])
                                }),
                                success: () => MyProjects.redraw_projects(),
                                error: () => Messages.error_message('Project published, but unable to update metadata.')
                            });
                        },
                        error: (e) => Messages.error_message(e.statusText)
                    });
                }
            });

        // Show the delete dialog
        this.publish_dialog.show();
    }

    share_project() {
        // If this project is already shared, show the update dialog instead
        if (this.shared) return this.shared.update_share();

        // Lazily create the share dialog
        if (!this.share_dialog)
            this.share_dialog = new Modal('share-project-dialog', {
                title: 'Share Project',
                body: [{
                        info: true,
                        value: "Enter the username or email of those you want to share the project with below."
                    },
                    {
                        label: "Share With",
                        name: "invites",
                        required: true,
                        advanced: false,
                        value: ''
                    }],
                button_label: 'Share',
                button_class: 'btn-warning share-button',
                callback: (form_data) => {
                    Messages.show_loading();

                    // Make the AJAX request
                    $.ajax({
                        method: 'POST',
                        url: this.share_url(),
                        contentType: 'application/json',
                        data: JSON.stringify({
                            "dir": this.slug(),
                            "invites": Project.invites_to_list(form_data['invites']),
                            "owner": GenePattern.projects.username
                        }),
                        success: () => {
                            Shares.redraw_shares(`Successfully shared ${this.display_name()}`)
                                .then(() => MyProjects.redraw_projects());
                        },
                        error: (e) => Messages.error_message(e.statusText)
                    });
                }
            });

        // Show the share dialog
        this.share_dialog.show();
    }

    edit_project() {
        // Lazily create the edit dialog
        if (!this.edit_dialog)
            this.edit_dialog = new Modal('edit-project-dialog', {
                title: 'Edit Project',
                body: Project.project_form_spec(this, ['author', 'quality', 'citation', 'tags']),
                button_label: 'Save',
                button_class: 'btn-warning edit-button',
                callback: (form_data, e) => {
                    // If required input is missing, highlight and wait
                    if (this.edit_dialog.missing_required()) return e.stopPropagation();

                    // Make the AJAX request
                    $.ajax({
                        method: 'POST',
                        url: this.api_url(),
                        contentType: 'application/json',
                        data: JSON.stringify({
                            "name": form_data['name'],
                            "image": form_data['image'],
                            "description": form_data['description'],
                            "author": form_data['author'],
                            "quality": form_data['quality'],
                            "citation": form_data['citation'],
                            "tags": Project.tags_to_string(form_data['tags'])
                        }),
                        success: () => MyProjects.redraw_projects(),
                        error: () => Messages.error_message('Unable to edit project.')
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
            success: () => {
                this.element.classList.add('nb-stopped');
                this.update_gear_menu(false);
            },
            error: () => Messages.error_message('Unable to stop project.')
        });
    }

    delete_project() {
        // Lazily create the delete dialog
        if (!this.delete_dialog) {
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
                        error: () => Messages.error_message('Unable to delete project.')
                    });
                }
            });
        }

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
            Messages.hide_loading();
        }
        else { // Otherwise, launch the server
            Messages.show_loading();

            // Make the AJAX request
            $.ajax({
                method: 'POST',
                url: this.api_url(),
                contentType: 'application/json',
                data: JSON.stringify({
                    "name": this.display_name(),
                    "image": this.image(),
                    "description": this.description(),
                    "author": this.author(),
                    "quality": this.quality(),
                    "citation": this.citation(),
                    "tags": this.tags(true)
                }),
                success: () => Messages.hide_loading(),
                error: () => Messages.error_message('Unable to edit project.')
            });
            setTimeout(() => {
                this.update_gear_menu(true);
                callback(this);
            }, 500);

            this.element.classList.remove('nb-stopped'); // Mark as running
        }
    }

    shared_with_me() {
        return this.slug().includes('.');
    }

    static not_disabled(event, callback) {
        if (!$(event.target).closest('li').hasClass('disabled')) callback();
        event.preventDefault();  // Prevent the screen from jumping back to the top of the page because of the # link
    }

    static tags_to_string(tag_json) {
        try {
            const tag_objs = JSON.parse(tag_json);
            const labels = [];
            tag_objs.forEach(t => labels.push(t.value.toLowerCase()));
            labels.sort();
            return labels.join(',');
        }
        catch { return ''; }

    }

    static invites_to_list(invite_json) {
        try {
            const invite_objs = JSON.parse(invite_json);
            const users = [];
            invite_objs.forEach(t => users.push(t.value.toLowerCase()));
            users.sort();
            return users
        }
        catch { return []; }

    }

    static project_form_spec(project=null, advanced=[], required=['name', 'image'], extra=null) {
        const params = [
            {
                label: "Project Name",
                name: "name",
                required: required.includes("name"),
                advanced: advanced.includes("name"),
                value: project ? project.display_name() : ''
            },
            {
                label: "Environment",
                name: "image",
                required: required.includes("image"),
                advanced: advanced.includes("image"),
                value: project ? project.image() : '',
                options: GenePattern.projects.images
            },
            {
                label: "Description",
                name: "description",
                required: required.includes("description"),
                advanced: advanced.includes("description"),
                value: project ? project.description() : ''
            },
            {
                label: "Author",
                name: "author",
                required: required.includes("author"),
                advanced: advanced.includes("author"),
                value: project ? project.author() : ''
            },
            {
                label: "Quality",
                name: "quality",
                required: required.includes("quality"),
                advanced: advanced.includes("quality"),
                value: project ? project.quality() : '',
                options: ["", "Development", "Beta", "Release"]
            },
            {
                label: "Citation",
                name: "citation",
                required: required.includes("citation"),
                advanced: advanced.includes("citation"),
                value: project ? project.citation() : ''
            },
            {
                label: "Tags",
                name: "tags",
                required: required.includes("tags"),
                advanced: advanced.includes("tags"),
                value: project ? project.tags(true) : ''
            }
        ];

        // If there are extra parameters to add, do so
        if (extra && Array.isArray(extra)) params = params.concat(extra);
        else if (extra) params.push(extra);

        return params;
    }
}

class PublishedProject extends Project {
    linked = null;  // Reference to linked personal project, if you are the owner

    display_name() {
        return this.model.name;
    }

    image() {
        return this.model.image;
    }

    slug() {
        return this.model.dir;
    }

    updated() {
        return this.model.updated;
    }

    comment() {
        return this.model.comment;
    }

    owner() {
        return this.model.owner;
    }

    build_gear_menu() {
        $(this.element).find('.dropdown-menu')
            .append($('<li><a href="#" class="dropdown-item nb-copy">Run</a></li>'))
            .append($('<li><a href="#" class="dropdown-item nb-download">Download</a></li>'))
            .append($('<li><a href="#" class="dropdown-item nb-preview">Preview</a></li>'));

        if (this.owner() === GenePattern.projects.username || GenePattern.projects.admin)
            $(this.element).find('.dropdown-menu')
                .append($('<li><a href="#" class="dropdown-item nb-update">Update</a></li>'))
                .append($('<li><a href="#" class="dropdown-item nb-unpublish">Unpublish</a></li>'));

        // Handle menu clicks
        $(this.element).find('.nb-copy').click(e => Project.not_disabled(e,() => this.copy_project()));
        $(this.element).find('.nb-download').click(e => Project.not_disabled(e,() => this.download_project()));
        $(this.element).find('.nb-preview').click(e => Project.not_disabled(e,() => this.preview_project()));
        $(this.element).find('.nb-update').click(e => Project.not_disabled(e,() => this.update_project()));
        $(this.element).find('.nb-unpublish').click(e => Project.not_disabled(e,() => this.unpublish_project()));
    }

    attach_default_click() {
        this.element.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) this.project_info();
        });
    }

    /**
     * Published projects have no running/stopped state, but return false so that they are grayed out
     *
     * @returns {boolean}
     */
    running() { return false; }

    download_url() {
        return `/services/projects/library/${this.model.id}/download/`;
    }

    preview_url() {
        return `/hub/preview?id=${this.model.id}`;
    }

    publish_url() {
        return `/services/projects/library/${this.model.id}/`;
    }

    copy_project() {
        // Make the call to copy the project
        Messages.show_loading();
        $.ajax({
            method: 'POST',
            url: this.publish_url(),
            contentType: 'application/json',
            success: (response) => {
                MyProjects.redraw_projects(`Successfully copied ${ this.display_name() }`).then(() => {
                    MyProjects.get(response['slug']).open_project();
                });
            },
            error: () => Messages.error_message('Unable to copy project.')
        });
    }

    download_project() {
        window.open(this.download_url());
    }

    preview_project() {
        window.open(this.preview_url());
    }

    project_info() {
        // Lazily create the published info dialog
        if (!this.info_dialog)
            this.info_dialog = new Modal('info-dialog', {
                title: this.display_name(),
                body: `<p>${ this.description() }</p>
                        <p>${ this.tags().map(i => '<span class="badge">' + i + '</span>').join('&nbsp;') }</p>
                       <table class="table table-striped">
                           <tr><th>Authors</th><td>${ this.author() }</td></tr>
                           <tr><th>Quality</th><td>${ this.quality() }</td></tr>
                           <tr><th>Environment</th><td>${ this.image() }</td></tr>
                           <tr><th>Owner</th><td>${ this.owner() }</td></tr>
                           <tr><th>Updated</th><td>${ this.updated().split(' ')[0] }</td></tr>
                           <tr><th>Comment</th><td>${ this.comment() }</td></tr>
                       </table>`,
                buttons: `
                    <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-default" data-dismiss="modal">Preview</button>
                    <button type="button" class="btn btn-primary run-button" data-dismiss="modal">Run Project</button>`,
                callback: [
                    () => {},                           // Cancel button
                    () => this.preview_project(),       // Preview button
                    () => this.copy_project()]          // Run Project button
            });

        // Show the info dialog
        this.info_dialog.show();
    }

    update_project() {
        // Lazily create the update dialog
        if (!this.update_dialog)
            this.update_dialog = new Modal('update-project-dialog', {
                title: 'Update Published Project',
                body: Project.project_form_spec(this.linked || this, [], ['name', 'image', 'author', 'quality', 'description'], {
                    label: "Version Comment",
                    name: "comment",
                    required: true,
                    advanced: false,
                    value: ''
                }),
                buttons: `
                    <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-danger" data-dismiss="modal">Unpublish</button>
                    <button type="button" class="btn btn-warning update-button" data-dismiss="modal">Update</button>`,
                callback: [
                    () => {},                           // Cancel button
                    () => this.unpublish_project(),     // Unpublish button
                    (form_data, e) => {                 // Update button
                        // If required input is missing, highlight and wait
                        if (this.update_dialog.missing_required()) return e.stopPropagation();
                        Messages.show_loading();

                        // Make the AJAX request
                        $.ajax({
                            method: 'PUT',
                            url: this.publish_url(),
                            contentType: 'application/json',
                            data: JSON.stringify({
                                "dir": this.slug(),
                                "image": form_data['image'],
                                "name": form_data['name'],
                                "description": form_data['description'],
                                "author": form_data['author'],
                                "quality": form_data['quality'],
                                "citation": form_data['citation'],
                                "tags": Project.tags_to_string(form_data['tags']),
                                "comment": form_data['comment']
                            }),
                            success: () => {
                                Library.redraw_library(`Successfully updated ${form_data['name']}`);
                                if (this.linked.running()) this.linked.stop_project();  // Stop the linked project

                                // If admin (not owner), skip updating personal project
                                if (this.owner() !== GenePattern.projects.username) return;

                                if (!this.push_updates_dialog) {
                                    this.push_updates_dialog = new Modal('push-updates-dialog', {
                                        title: 'Update Private Project?',
                                        body: `<p>You have successfully updated the published project, ${form_data['name']}. Do you wish to 
                                                  push metadata updates (name, description, tags, etc.) to your 
                                                  associated private project as well?</p>`,
                                        button_label: 'Push Updates',
                                        button_class: 'btn-warning push-updates-button',
                                        callback: () => {
                                            // Sync published metadata with personal project metadata
                                            $.ajax({
                                                method: 'POST',
                                                url: this.linked.api_url(),
                                                contentType: 'application/json',
                                                data: JSON.stringify({
                                                    "name": form_data['name'],
                                                    "image": form_data['image'],
                                                    "description": form_data['description'],
                                                    "author": form_data['author'],
                                                    "quality": form_data['quality'],
                                                    "citation": form_data['citation'],
                                                    "tags": Project.tags_to_string(form_data['tags'])
                                                }),
                                                success: () => MyProjects.redraw_projects(),
                                                error: () => Messages.error_message('Project updated, but unable to update metadata.')
                                            });
                                        }
                                    });
                                }
                                this.push_updates_dialog.show();
                            },
                            error: (e) => Messages.error_message(e.statusText)
                        });
                    }]
            });

        // Show the update dialog
        this.update_dialog.show();
    }

    unpublish_project() {
        // Lazily create the unpublish dialog
        if (!this.unpublish_dialog) {
            this.unpublish_dialog = new Modal('unpublish-project-dialog', {
                title: 'Unpublish Project',
                body: '<p>Are you sure that you want to unpublish this project?</p>',
                button_label: 'Unpublish',
                button_class: 'btn-danger unpublish-button',
                callback: () => {
                    // Make the call to delete the project
                    $.ajax({
                        method: 'DELETE',
                        url: this.publish_url(),
                        contentType: 'application/json',
                        success: () => {
                            $(this.element).remove();
                            Library.redraw_library().then(() => MyProjects.redraw_projects());
                        },
                        error: () => Messages.error_message('Unable to unpublish project.')
                    });
                }
            });
        }

        // Show the unpublish dialog
        this.unpublish_dialog.show();
    }
}

class SharedProject extends Project {
    linked = null;  // Reference to linked personal project, if shared by you

    constructor(sharing_json) {
        // Does this shared project have a local copy (because ran before ans shared with me)
        const local = SharedProject.local_copy(sharing_json.owner, sharing_json.dir);

        // If so, initialize based on the local copy's data
        if (local) super(SharedProject.merge_sharing(local.model, sharing_json));

        // If not, was project data specified in the sharing endpoint? If so, initialize with that data
        else if (sharing_json.project) super(SharedProject.merge_sharing(sharing_json.project, sharing_json));

        // If not, there must have been an issue getting the project data on the server-side, init with best effort
        else super(SharedProject.placeholder_data(sharing_json));
    }

    invite() {
        for (let i of this.model.sharing.invites)
            if (i.user === GenePattern.projects.username) return i;
        return null;
    }

    invite_id() {
        const invite = this.invite();
        if (invite) return invite.id;
        else return null;
    }

    owner() {
        return this.model.sharing.owner;
    }

    slug() {
        if (this.model.sharing.owner === GenePattern.projects.username) return this.model.sharing.dir; // Shared by me
        else return `${ MyProjects.encode_username(this.model.sharing.owner) }.${this.model.sharing.dir}`;                           // Shared with me
    }

    invite_pending() {
        const invite = this.invite();
        if (invite) return !invite.accepted;
        else return null;
    }

    share_url() {
        if (this.model.sharing.owner === GenePattern.projects.username)         // Shared by me
            return `/services/projects/sharing/${this.model.sharing.id}/`;
        else return `/services/projects/sharing/invite/${this.invite_id()}/`;   // Shared with me
    }

    build() {
        super.build();
        if (this.invite_pending()) this.invite_cover();
        this.attach_shared_by();
    }

    invite_cover() {
        const cover_template = `
            <div class="nb-invite">
                <div class="nb-img-top">
                    <div class="nb-invite-buttons">
                        <button class="nb-invite-accept"><i class="fa fa-check-circle"></i><br/>Accept Invite</button>
                        <button class="nb-invite-reject"><i class="fa fa-times-circle"></i><br/>Reject Invite</button>
                    </div>
                </div>
                <div class="nb-invite-line">${this.model.sharing.owner} has invited you to share</div>
            </div>`;
        this.element.append(new DOMParser().parseFromString(cover_template, "text/html").querySelector('div'));

        // Attach the accept and reject callbacks
        $(this.element).find('.nb-invite-accept').click(e => Project.not_disabled(e,() => this.accept_invite()));
        $(this.element).find('.nb-invite-reject').click(e => Project.not_disabled(e,() => this.unshare_project()));
    }

    attach_shared_by() {
        const owner_template = `<div class="nb-owner">Shared by ${this.model.sharing.owner}</div>`;
        this.element.append(new DOMParser().parseFromString(owner_template, "text/html").querySelector('div'));
    }

    attach_default_click() {
        this.element.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown') &&
                !e.target.closest('.nb-invite')) this.open_project()
        });
    }

    build_gear_menu() {
        // Add the menu items
        $(this.element).find('.dropdown-menu')
            .append($('<li><a href="#" class="dropdown-item nb-unshare">Unshare</a></li>'))
            .append($('<li><a href="#" class="dropdown-item nb-stop">Stop</a></li>'));

        // Handle menu clicks
        $(this.element).find('.nb-stop').click(e => Project.not_disabled(e,() => this.stop_project()));
        $(this.element).find('.nb-unshare').click(e => Project.not_disabled(e,() => this.unshare_project()));

        // Enable or disable options
        this.update_gear_menu(this.running())
    }

    accept_invite() {
        // Make the call to accept the sharing invite
        $.ajax({
            method: 'POST',
            url: this.share_url(),
            contentType: 'application/json',
            success: () => {
                this.element.querySelector('.nb-invite').style.display = 'none';  // Hide the invite cover
            },
            error: () => Messages.error_message('Unable to accept the sharing invite.')
        });
    }

    unshare_project() {
        // Lazily create the unshare dialog
        if (!this.unshare_dialog) {
            this.unshare_dialog = new Modal('unshare-project-dialog', {
                title: 'Unshare Project',
                body: '<p>Are you sure that you want to unshare this project?</p>',
                button_label: 'Unshare',
                button_class: 'btn-danger unshare-button',
                callback: () => {
                    // Make the call to unshare the project
                    $.ajax({
                        method: 'DELETE',
                        url: this.share_url(),
                        contentType: 'application/json',
                        success: () => {
                            Shares.redraw_shares(`Successfully unshared ${this.display_name()}`)
                                .then(() => MyProjects.redraw_projects());
                        },
                        error: () => Messages.error_message('Unable to unshare project.')
                    });
                }
            });
        }

        // Show the unshare dialog
        this.unshare_dialog.show();
    }

    update_share() {
        // Lazily create the share dialog
        if (!this.share_dialog)
            this.share_dialog = new Modal('update-share-dialog', {
                title: 'Update Sharing',
                body: [{
                        info: true,
                        value: "Enter the username or email of those you want to share the project with below."
                    },
                    {
                        label: "Share With",
                        name: "invites",
                        required: true,
                        advanced: false,
                        value: this.model.sharing.invites.map(({user}) => user).join(',')
                    }],
                buttons: `
                    <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-danger" data-dismiss="modal">Unshare</button>
                    <button type="button" class="btn btn-warning update-button" data-dismiss="modal">Update</button>`,
                callback: [
                    () => {},                           // Cancel button
                    () => this.unshare_project(),       // Unshare button
                    (form_data, e) => {                 // Update button
                        Messages.show_loading();

                        // Make the AJAX request
                        $.ajax({
                            method: 'PUT',
                            url: this.share_url(),
                            contentType: 'application/json',
                            data: JSON.stringify({
                                "dir": this.slug(),
                                "invites": Project.invites_to_list(form_data['invites']),
                                "owner": GenePattern.projects.username
                            }),
                            success: () => {
                                Shares.redraw_shares(`Successfully updated sharing of ${this.display_name()}`)
                                    .then(() => MyProjects.redraw_projects());
                            },
                            error: (e) => Messages.error_message(e.statusText)
                        });
                    }]
            });

        // Show the share dialog
        this.share_dialog.show();
    }

    static merge_sharing(project_json, sharing_json) {
        project_json['sharing'] = sharing_json;
        return project_json;
    }

    static local_copy(owner, slug) {
        let local_found = null;

        GenePattern.projects.my_projects.forEach(per => {
            if (per.slug() === `${owner}.${slug}`) local_found = per;
        });

        return local_found
    }

    static placeholder_data(project_json) {
        return {
            'slug': project_json.dir,
            'active': false,
            'last_activity': null,
            'display_name': project_json.dir,
            'image': '',
            'description': `Shared by ${project_json.owner}`,
            'author': project_json.owner,
            'quality': 'Unknown',
            'tags': '',
            'status': null,
            'sharing': project_json
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
                <p class="panel-title">New Project</p>
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
        $(this.element).click(() => this.create_project());
    }

    get_url() {
        return `/user/${GenePattern.projects.encoded_username}/`;
    }

    api_url() {
        return `${GenePattern.projects.base_url}api/users/${GenePattern.projects.encoded_username}/servers/`;
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

    create_project() {
        // Lazily create the new project dialog
        if (!this.project_dialog)
            this.project_dialog = new Modal('new-project-dialog', {
                title: 'Create New Project',
                body: Project.project_form_spec(null, ['author', 'quality', 'citation', 'tags']),
                button_label: 'Create Project',
                button_class: 'btn-success create-button',
                callback: (form_data, e) => {
                    // If required input is missing, highlight and wait
                    if (this.project_dialog.missing_required()) return e.stopPropagation();

                    // Generate the slug
                    let slug = form_data['name'].toLowerCase().replace(/[^A-Z0-9]+/ig, "_");
                    if (slug.endsWith('_')) slug += 'project';  // Swarm doesn't like slugs that end in an underscore

                    // Make sure there isn't already a project named this
                    if (this.project_exists(slug)) {
                        Messages.error_message('Please choose a different name. A project already exists with that name.');
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
                            "description": form_data['description'],
                            "author": form_data['author'],
                            "quality": form_data['quality'],
                            "citation": form_data['citation'],
                            "tags": Project.tags_to_string(form_data['tags'])
                        }),
                        success: () => {
                            // Open the project and refresh the page
                            window.open(this.get_url() + slug);
                            MyProjects.redraw_projects();
                        },
                        error: () => Messages.error_message('Unable to create project.')
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
    form_defaults = null;
    tagify = null;
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
        this.form_defaults = this.gather_form_data();
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
        this.set_form_defaults();                                               // Reset the form
        $(this.element).modal();                            // Display the modal dialog using JupyterHub's modal call
        this.activate_controls();                                               // Activate interactive elements
    }

    activate_controls() {
        this.activate_tags();
        this.activate_invites();
        this.activate_advanced();
    }

    activate_advanced() {
        $(this.element).find('a.nb-more').one('click', () => {
            $(this.element).find('.nb-advanced').show('slide');
            $(this.element).find('div.nb-more').hide('slide');
        });
        $(this.element).one('hidden.bs.modal', () => {
            $(this.element).find('.nb-advanced').hide();
            $(this.element).find('div.nb-more').show();
        });
    }

    activate_invites() {
        const invite_input = this.element.querySelector('input[name=invites]');
        if (invite_input && !this.tagify) {
            const options = {};
            options['blacklist'] = [GenePattern.projects.username];
            this.tagify = new Tagify(invite_input, options);
        }
        else if (invite_input) {
            this.tagify.loadOriginalValues(invite_input.value);
        }
    }

    activate_tags() {
        const tags_input = this.element.querySelector('input[name=tags]');
        if (tags_input && !this.tagify) {
            const options = {};
            options['pattern'] = /^[a-zA-Z0-9-]+$/;
            if (!GenePattern.projects.admin) options['blacklist'] = GenePattern.projects.protected_tags;
            this.tagify = new Tagify(tags_input, options);
        }
        else if (tags_input) {
            this.tagify.loadOriginalValues(tags_input.value);
        }
    }

    form_builder(body_spec) {
        // Assume body is a list of objects
        // {
        //     label: str,
        //     name: str,
        //     required: boolean,
        //     advanced: boolean,
        //     value: str,
        //     options: list
        //     info: boolean (optional)
        // }
        const form = $('<div class="form-horizontal"></div>');
        body_spec.forEach((param) => {
            let grouping = $('<div class="form-group"></div>');
            if (param['advanced']) grouping.addClass('nb-advanced');
            const asterisk = param['required'] ? '*' : '';
            grouping.append($(`<label for="${param['name']}" class="control-label col-sm-4">${param['label']}${asterisk}</label>`));
            if (param['info']) {                                        // Handle info boxes
                grouping = $(`<div class="alert alert-info">${param['value']}</div>`);
            }
            else if (!param['options'] || !param['options'].length) {   // Handle text parameters
                let input = $(`<div class="col-sm-8"><input name="${param['name']}" type="text" class="form-control" value="${param['value']}" /></div>`)
                if (param['required']) input.find('input').attr('required', 'required');
                grouping.append(input);
            }
            else {                                                      // Handle select parameters
                const div = $('<div class="col-sm-8"></div>');
                const select = $(`<select name="${param['name']}" class="form-control"></select>`).appendTo(div);
                if (param['required']) select.attr('required', 'required');
                param['options'].forEach((option) => {
                    if (option === param['value']) select.append($(`<option value="${option}" selected>${option}</option>`));
                    else select.append($(`<option value="${option}">${option}</option>`))
                });
                grouping.append(div);
            }
            form.append(grouping);
        });
        if (form.find('.nb-advanced').length) {   // If necessary, add the "Show More"" control
            const control = $(`<div class="form-group nb-more">
                                   <label class="col-sm-4"></label>
                                   <label class="col-sm-8">
                                       <a class="nb-more" href="#">Show More</a>
                                   </label>
                               </div>`);
            form.append(control);
        }
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

    set_form_defaults() {
        const inputs = this.element.querySelectorAll('input, select');
        inputs.forEach(i => i.value = this.form_defaults[i.getAttribute('name')]);
    }

    attach_callback() {
        const buttons = this.element.querySelector('.modal-footer').querySelectorAll('.btn');

        // If a list of callbacks has been provided, assign one to each button, left to right
        if (Array.isArray(this.callback)) {
            for (let i = 0; i < this.callback.length && i < buttons.length; i++)
                buttons[i].addEventListener("click", e => {
                    const form_data = this.gather_form_data();
                    this.callback[i](form_data, e);
                });
        }

        // Otherwise assign the callback to the leftmost button
        else if (buttons.length) buttons[buttons.length - 1].addEventListener("click", e => {
            const form_data = this.gather_form_data();
            this.callback(form_data, e);
        });
    }

    missing_required() {
        let missing_input = false;
        this.element.querySelectorAll('input, select').forEach(e => {
            if (e.hasAttribute('required') && !e.value) {
                e.style.border = 'solid red 2px';
                missing_input = true;
            }
        });
        return missing_input;
    }
}

class Messages {
    static scroll_to_top() {
        document.documentElement.scrollTop = 0;
    }

    static error_message(message) {
        Messages.scroll_to_top();
        Messages.hide_loading();

        $('#messages').empty().append(
            $(`<div class="alert alert-danger">${message}</div>`)
        )
    }

    static success_message(message) {
        Messages.scroll_to_top();
        Messages.hide_loading();

        $('#messages').empty().append(
            $(`<div class="alert alert-success">${message}</div>`)
        )
    }

    static show_loading() {
        // Lazily create the loading dialog
        if (!this.loading_dialog) {
            this.loading_dialog = new Modal('loading-dialog', {
                title: 'Loading...',
                body: '<i class="fa fa-spinner fa-spin fa-3x fa-fw nb-spinner"></i>',
                footer: ''
            });
        }

        // Show the loading dialog, hide the footer and close button
        this.loading_dialog.show();
        $("#loading-dialog  .modal-footer, #loading-dialog .close").hide();
    }

    static hide_loading() {
        $("#loading-dialog .close").click();
    }
}

class MyProjects {
    constructor() {
        this.initialize_search();                           // Initialize the search box
        this.initialize_buttons();                          // Initialize the new project button
        MyProjects.redraw_projects()                        // Add the projects to the page
            .then(() => Shares.redraw_shares()              // Add the share projects to the page
                .then(() => MyProjects.link_shared()))      // Mark which projects are shared
            .then(() => Library.redraw_library()            // Then add the public projects to the page
                .then(() => MyProjects.link_published()));  // Mark which projects are published
        this.initialize_refresh();                          // Begin the periodic refresh
    }

    static decode_username(encoded_name) {
        return decodeURIComponent(encoded_name.replace(/-/g, '%'));
    }

    static encode_username(username) {
        return encodeURIComponent(username.toLowerCase())
            .replaceAll('.', '%2e')
            .replaceAll('-', '%2d')
            .replaceAll('~', '%7e')
            .replaceAll('_', '%5f')
            .replaceAll('%', '-');
    }

    static query_projects() {
        function sort(a, b) {
            // Basic case-insensitive alphanumeric sorting
            const a_text = a.display_name().toLowerCase();
            const b_text = b.display_name().toLowerCase();
            if ( a_text < b_text ) return -1;
            if ( a_text > b_text ) return 1;
            return 0;
        }

        return fetch('/services/projects/user.json')
            .then(response => response.json())
            .then(response => {
                GenePattern.projects.username = MyProjects.decode_username(response['name']);
                GenePattern.projects.encoded_username = response['name'];
                GenePattern.projects.base_url = response['base_url'];
                GenePattern.projects.admin = response['admin'];
                GenePattern.projects.images = response['images'];
                GenePattern.projects.my_projects = [];                          // Clean the my_projects list
                response['projects'].forEach((p) => GenePattern.projects.my_projects.push(new Project(p)));
                GenePattern.projects.my_projects.sort(sort);                    // Sort the my_projects list
            })
    }

    static redraw_projects(message=null) {
        if (message) Messages.success_message(message);
        return MyProjects.query_projects().then(() => {
            document.querySelector('#projects').innerHTML = '';                     // Empty the projects div
            GenePattern.projects.my_projects.forEach((p) => {                            // Add the project widgets
                if (!p.shared_with_me()) document.querySelector('#projects').append(p.element)
            });

            // Add new project widget
            if (!GenePattern.projects.new_project) GenePattern.projects.new_project = new NewProject();
            document.querySelector('#projects').append(GenePattern.projects.new_project.element);

            // Link to published projects
            MyProjects.link_published();

            // Link to shared projects
            MyProjects.link_shared();
        });
    }

    static link_published() {
        // Get a list of the user's published projects
        const my_published = [];
        GenePattern.projects.library.forEach(p => {
            if (p.owner() === GenePattern.projects.username) my_published.push(p)
        });

        // For each user published project, link the corresponding personal project
        my_published.forEach(pub => {
            GenePattern.projects.my_projects.forEach(per => {
                if (per.slug() === pub.slug()) per.mark_published(pub);
            });
        });
    }

    static link_shared() {
        // For each project shared by me, link the corresponding personal project
        GenePattern.projects.shared_by_me.forEach(share => {
            GenePattern.projects.my_projects.forEach(per => {
                if (per.slug() === share.slug()) per.mark_shared(share);
            });
        });
    }

    static get(search_term) {
        let found = null;
        GenePattern.projects.my_projects.forEach(p => {
            if (found) return;                          // If already found, skip
            if (p.model.id === search_term) found = p;  // Searching by id
            if (p.slug() === search_term) found = p;    // Searching by slug
        });
        return found;
    }

    initialize_search() {
        $('#nb-project-search').keyup((event) => {
            let search = $(event.target).val().trim().toLowerCase();

            // Display the matching projects
            const projects = $('#projects, #shares').find('.nb-project');
            projects.each(function(i, project) {
                project = $(project);

                // Matching notebook
                if (project.find("div:not(.dropdown)").text().toLowerCase().includes(search)) project.removeClass('hidden');

                // Not matching notebook
                else project.addClass('hidden');
            });
        });
    }

    initialize_buttons() {
        // Handle new project button click
        $('#nb-new').click(() => {
            GenePattern.projects.new_project.create_project();
        });
    }

    initialize_refresh() {
        setInterval(() => {
            MyProjects.redraw_projects()
                .then(() => Shares.redraw_shares()
                    .then(() => MyProjects.link_shared()))
                .then(() => Library.redraw_library()
                    .then(() => MyProjects.link_published()));
        }, 1000 * 60);     // Refresh the list every minute
    }
}

class Library {
    constructor() {
        this.initialize_search();   // Initialize the search box
    }

    static query_library() {
        function sort(a, b) {
            // Basic case-insensitive alphanumeric sorting
            const a_text = a.updated();
            const b_text = b.updated();
            if ( a_text < b_text ) return 1;
            if ( a_text > b_text ) return -1;
            return 0;
        }

        return fetch('/services/projects/library/')
            .then(response => response.json())
            .then(response => {
                GenePattern.projects.library = [];                          // Clean the library list
                response['projects'].forEach((p) => GenePattern.projects.library.push(new PublishedProject(p)));
                GenePattern.projects.library.sort(sort);                    // Sort the library list

                GenePattern.projects.pinned_tags = [];                      // Clean the pinned list
                response['pinned'].forEach((t) => GenePattern.projects.pinned_tags.push(t));
                GenePattern.projects.pinned_tags.sort();                    // Sort the list alphabetically

                GenePattern.projects.protected_tags = [];                   // Clean the protected list
                response['protected'].forEach((t) => GenePattern.projects.protected_tags.push(t));
                GenePattern.projects.protected_tags.sort();                 // Sort the list alphabetically
            })
    }

    static redraw_library(message=null) {
        if (message) Messages.success_message(message);
        return Library.query_library().then(() => {
            document.querySelector('#library').innerHTML = '';             // Empty the library div
            GenePattern.projects.library.forEach((p) =>                         // Add the project widgets
                document.querySelector('#library').append(p.element));
            Library.redraw_pinned();                                                // Redraw the pinned tags
        });
    }

    static redraw_pinned() {
        const pinned_block = $('#pinned-tags');
        const current_selection = pinned_block.find('.active > a').data('tag');
        const featured_exists = GenePattern.projects.pinned_tags.includes("featured");

        pinned_block.empty();                                                               // Empty the pinned div
        if (featured_exists) {                                                              // Special case for featured
            pinned_block.prepend($('<li><a href="#" data-tag="featured">featured</a></li>'));
        }
        GenePattern.projects.pinned_tags.forEach(tag => {                                   // Add each pinned tag
            if (tag !== 'featured') pinned_block.prepend($(`<li><a href="#" data-tag="${tag}">${tag}</a></li>`));
        });
        pinned_block.prepend($('<li><a href="#" data-tag="-all">all projects</a></li>'));   // Add "all projects"

        // Set the active tab
        if (!!current_selection) pinned_block.find(`[data-tag='${current_selection}']`).parent().addClass('active');
        else if (featured_exists) pinned_block.find(`[data-tag='featured']`).parent().addClass('active');
        else pinned_block.find('li:first-child').addClass('active');

        pinned_block.find('a').click(e => {
            const tag = $(e.target).attr("data-tag");                                 // Get the tag

            if (tag !== '-all') $('#nb-library-search').val('').trigger('keyup');// Clear the search

            $("#library").find(".nb-project").each((i, p) => {                      // For each project
                let found = false;
                let workshop = false;
                if (tag === '-all') found = true;                                           // If all, always display
                else $(p).find(".nb-tags > .badge").each((i, t) => {                // Otherwise, for each tag
                    if (tag === $(t).text() && !workshop) found = true;                     // If it has the tag, show
                    if (tag !== 'workshop' && $(t).text() === 'workshop') workshop = true;  // (workshop special case)
                });
                if (found) $(p).removeClass("hidden");                                // Hide or show
                else $(p).addClass("hidden");
            });

            $("#pinned-tags > li").removeClass('active');                             // Activate the clicked tag
            $(e.target).parent().addClass('active');

            e.preventDefault();                                                             // Don't scroll to top
            return false;
        });
        pinned_block.find('.active > a').click()     // Filter again for the current tag
    }

    initialize_search() {
        const pinned_block = $('#pinned-tags');

        $('#nb-library-search').keyup((event) => {
            if (pinned_block.find('li.active').text() !== 'all projects')           // Always search all projects
                pinned_block.find('a[data-tag="-all"]').click();

            let search = $(event.target).val().trim().toLowerCase();

            // Display the matching projects
            const projects = $('#library').find('.nb-project');
            projects.each(function(i, project) {
                // Matching notebook
                if ($(project).find("div:not(.dropdown)").text().toLowerCase().includes(search)) project.style.display = 'inline-block';

                // Not matching notebook
                else project.style.display = 'none';
            });
        });
    }
}

class Shares {

    static query_shares() {
        function sort(a, b) {
            // Basic case-insensitive alphanumeric sorting
            const a_text = a.owner();
            const b_text = b.owner();
            if ( a_text < b_text ) return 1;
            if ( a_text > b_text ) return -1;
            return 0;
        }

        return fetch('/services/projects/sharing/')
            .then(response => response.json())
            .then(response => {
                GenePattern.projects.shared_with_me = [];                           // Clean the sharing lists
                response['shared_with_me'].forEach((p) => GenePattern.projects.shared_with_me.push(new SharedProject(p)));
                GenePattern.projects.shared_with_me.sort(sort);                     // Sort the shared list

                GenePattern.projects.shared_by_me = [];
                response['shared_by_me'].forEach((p) => GenePattern.projects.shared_by_me.push(new SharedProject(p)));
            });
    }

    static redraw_shares(message=null) {
        if (message) Messages.success_message(message);
        return Shares.query_shares().then(() => {
            document.querySelector('#shares').innerHTML = '';              // Empty the shares div
            GenePattern.projects.shared_with_me.forEach((p) =>                  // Add the project widgets
                document.querySelector('#shares').append(p.element));
            if (GenePattern.projects.shared_with_me.length === 0)
                document.querySelector('#nb-sharing-header').style.display = 'none';
            else document.querySelector('#nb-sharing-header').style.display = 'block';
        });
    }
}

new MyProjects();
new Library();
