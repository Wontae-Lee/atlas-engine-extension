const path = require('node:path');
const { buildSync } = require('esbuild');

const result = buildSync({
    absWorkingDir: path.resolve(__dirname, '..'),
    entryPoints: ['src/contributions.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    write: false,
    logLevel: 'silent',
});
const registry = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, registry, registry.exports);
const { containers, views, commands, panels } = registry.exports.createContributions();

function uniqueIds(entries, label) {
    const ids = new Set();
    for (const entry of entries) {
        if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) {
            throw new Error(`Invalid or duplicate ${label} ID: ${entry.id}`);
        }
        ids.add(entry.id);
    }
    return ids;
}

const containerIds = uniqueIds(containers, 'container');
uniqueIds(views, 'view');
uniqueIds(panels, 'panel');
const actions = [
    ...commands,
    ...panels.map(panel => ({ id: panel.commandId, title: panel.title })),
];
uniqueIds(actions, 'command');
const contributions = {
    viewsContainers: { activitybar: containers },
    views: {},
    viewsWelcome: [],
    commands: actions.map(command => ({ command: command.id, title: command.title })),
};
for (const view of views) {
    if (!containerIds.has(view.container)) {
        throw new Error(`Unknown container ${view.container} for view ${view.id}`);
    }
    (contributions.views[view.container] ??= []).push({ id: view.id, name: view.title });
    if (view.welcome !== undefined) {
        contributions.viewsWelcome.push({ view: view.id, contents: view.welcome });
    }
}
process.stdout.write(JSON.stringify({ contributes: contributions }));
