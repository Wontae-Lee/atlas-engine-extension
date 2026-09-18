const path = require('node:path');
const { buildSync } = require('esbuild');

const result = buildSync({
    absWorkingDir: path.resolve(__dirname, '..'),
    entryPoints: ['src/atlas/contributions.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    write: false,
    logLevel: 'silent',
});
const registry = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, registry, registry.exports);
const { layout, commands } = registry.exports.createContributions();

function unique_ids(entries, label) {
    const ids = new Set();
    for (const entry of entries) {
        if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) {
            throw new Error(`Invalid or duplicate ${label} ID: ${entry.id}`);
        }
        ids.add(entry.id);
    }
    return ids;
}

unique_ids(layout.containers, 'container');
unique_ids(layout.views, 'view');
const actions = [
    ...commands,
    ...layout.center.views.map(view => ({ id: view.command_id, title: `Atlas Engine: Open ${view.title}` })),
];
unique_ids(actions, 'command');
const contributions = {
    viewsContainers: {},
    views: {},
    commands: actions.map(command => ({ command: command.id, title: command.title })),
};
for (const container of layout.containers) {
    if (!['activitybar', 'secondarySidebar', 'panel'].includes(container.location)) {
        throw new Error(`Unsupported view container location: ${container.location}`);
    }
    (contributions.viewsContainers[container.location] ??= []).push({
        id: container.id,
        title: container.title,
        icon: container.icon,
    });
    contributions.views[container.id] = container.views.map(view => ({ id: view.id, name: view.title }));
}
process.stdout.write(JSON.stringify({ contributes: contributions }));
