const esbuild = require('esbuild');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const webview_directory = path.join(__dirname, 'src/atlas/ui/simulation_view/webview');

async function main() {
    const extension = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        plugins: [{
            name: 'manifest-and-cleanup',
            setup(build) {
                build.onStart(() => {
                    execFileSync('python3', ['scripts/generate_manifest.py'], {cwd: __dirname, stdio: 'inherit'});
                });
                build.onEnd(result => {
                    if (result.errors.length === 0) {
                        fs.rmSync(path.join(__dirname, 'dist/runtime'), {recursive: true, force: true});
                    }
                });
            }
        }]
    });
    const webview = await esbuild.context({
        entryPoints: {main: path.join(webview_directory, 'main.ts')},
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        outdir: 'dist/webview',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        plugins: [{
            name: 'webview-styles',
            setup(build) {
                build.onLoad({filter: /[\\/]webview[\\/]main\.ts$/}, args => ({
                    contents: fs.readFileSync(args.path, 'utf8'),
                    loader: 'ts',
                    watchFiles: [path.join(webview_directory, 'simulation.css')]
                }));
                build.onEnd(result => {
                    if (result.errors.length === 0) {
                        const target = path.join(__dirname, 'dist/webview');
                        fs.mkdirSync(target, {recursive: true});
                        fs.copyFileSync(path.join(webview_directory, 'simulation.css'),
                            path.join(target, 'simulation.css'));
                        fs.rmSync(path.join(target, 'scene.js'), {force: true});
                    }
                });
            }
        }]
    });
    if (watch) {
        await Promise.all([extension.watch(), webview.watch()]);
    } else {
        try {
            await Promise.all([extension.rebuild(), webview.rebuild()]);
        } finally {
            await Promise.all([extension.dispose(), webview.dispose()]);
        }
    }
}

main().catch(error => {
    process.stderr.write(`${error}\n`);
    process.exit(1);
});
