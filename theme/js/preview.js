var GenePattern = GenePattern || {};
GenePattern.preview = GenePattern.preview || {};
GenePattern.preview.id = GenePattern.preview.id || '';
GenePattern.preview.project = GenePattern.preview.project || {};

class Preview {
    constructor() {
        this.initialize_preview();   // Initialize the preview
    }

    static query_preview() {
        return fetch(`/services/projects/library/${GenePattern.preview.id}/?files=true`)
            .then(response => response.json())
            .then(response => {
                GenePattern.preview.project = response;
            });
    }

    static draw_preview() {
        // Add basic project information to the page
        $('#nb-preview-name').text(GenePattern.preview.project.name);
        $('#nb-preview-description').text(GenePattern.preview.project.description);
        $('#nb-preview-author').text(GenePattern.preview.project.author);
        $('#nb-preview-quality').text(GenePattern.preview.project.quality);
        $('#nb-preview-image').text(GenePattern.preview.project.image);
        $('#nb-preview-owner').text(GenePattern.preview.project.owner);
        $('#nb-preview-updated').text(GenePattern.preview.project.updated);
        $('#nb-preview-comment').text(GenePattern.preview.project.comment);

        // Add tags
        GenePattern.preview.project.tags.split(',')
            .forEach(t => $('#nb-preview-tags').append($(`<span class="badge">${t}</span>`)).append('&nbsp;'));

        // Add button links
        $('#nb-preview-download').attr('href', `/services/projects/library/${GenePattern.preview.id}/download/`);
        $('#nb-preview-run').attr('href', `/hub/login?next=%2Fservices%2Fprojects%2Flibrary%2F${GenePattern.preview.id}%2Fcopy%2F`);

        // Add files to the table
        GenePattern.preview.project.files
            .forEach(f => $('#nb-preview-files').append($(`<tr><td>${Preview.icon(f.filename)} ${f.filename}</td><td>${f.modified}</td><td>${f.size}</td></tr>`)));

        // Add the citation
        $('#nb-citation-notebook').text(Preview.generate_citation());
    }

    static generate_citation() {
        // If a project has a custom citation provided, return it
        if (GenePattern.preview.project.citation) return GenePattern.preview.project.citation;

        // Otherwise, generate a project citation
        const now = (new Date()).toDateString();
        return `${GenePattern.preview.project.author}, "${GenePattern.preview.project.name}", GenePattern Notebook Workspace, ${location.href}, accessed ${now}.`;
    }

    static icon(filename) {
        if (filename.endsWith('.ipynb')) return '<i class="fa fa-book" title="Notebook"></i>';
        else if (filename.endsWith('/')) return '<i class="fa fa-folder-open" title="Directory"></i>';
        else return '<i class="fa fa-file" title="Supporting File"></i>';
    }

    static error_message(message) {
        $('#messages').empty().append(
            $(`<div class="alert alert-danger">${message}</div>`)
        );
        $('table, .nb-preview-buttons').hide();  // Hide blank tables and buttons
    }

    static extract_parameters() {
        return new Promise((resolve, reject) => {
            // Extract the GET parameters from the URL
            const params = new URLSearchParams(window.location.search);
            GenePattern.preview.id = params.get('id');

            // If there are problems extracting the parameters, show an error message
            if (!GenePattern.preview.id) {
                Preview.error_message('Cannot render preview, missing required parameters');
                reject();
            }

            // Otherwise, continue
            else resolve();
        });
    }

    initialize_preview() {
        Preview.extract_parameters()                    // Extract the GET parameters
            .then(() => Preview.query_preview()         // Query the preview service using those parameters
                .then(() => Preview.draw_preview()))    // Draw the preview on the page
                    .catch(e => {
                        Preview.error_message('Error retrieving project data.');
                        console.error(e);
                    })
    }
}

new Preview();