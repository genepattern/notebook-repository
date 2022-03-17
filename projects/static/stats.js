var GenePattern = GenePattern || {};
GenePattern.stats = GenePattern.stats || {};
GenePattern.stats.updates = GenePattern.stats.updates || {};
GenePattern.stats.usage = GenePattern.stats.usage || {};

class Stats {
    constructor() {
        // Query the stats endpoint and render the tables
        Stats.query_stats().then(() => Stats.draw_tables());
    }

    static query_stats() {
        return fetch(`/services/projects/stats/`)
            .then(response => response.json())
            .then(response => {
                GenePattern.stats.updates = response['updates'];
                GenePattern.stats.usage = response['usage'];
            });
    }

    static draw_tables() {
        // Initialize the top projects table
        GenePattern.stats.usage.forEach(project => {
            const project_link = project.deleted ? `<del>${project.name}</del>` :
                `<a href="/hub/preview?id=${project.id}" target="_blank">${project.name}</a>`;
            $('#nb-most-copied').append(`<tr><td>${project_link}</td><td>${project.copied}</td></tr>`);
        });

        // Initialize the recent updates table
        GenePattern.stats.updates.forEach(update => {
            const project_link = update.project_deleted || !update.project ? `<del>${update.project}</del>` :
                `<a href="/hub/preview?id=${update.project_id}" target="_blank">${update.project}</a>`;
            $('#nb-latest-updates').append(`<tr><td>${project_link}</td><td>${update.comment}</td><td>${update.updated}</td></tr>`);
        });
    }
}

new Stats();