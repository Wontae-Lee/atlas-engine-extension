const esbuild = require("esbuild");
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const runtime_files = ['engine_session.py', 'engine_server.py', 'engine_scene.py'];
const runtime_directory = path.join(__dirname, 'src/atlas/streaming/runtime');
const webview_directory = path.join(__dirname, 'src/atlas/views/center/webview');


const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onLoad({filter: /streaming[\\/]runtime_source\.ts$/}, args => ({
            contents: fs.readFileSync(args.path, 'utf8'),
            loader: 'ts',
            watchFiles: runtime_files.map(name => path.join(runtime_directory, name))
        }));
        build.onStart(() => {
            execFileSync('python3', ['scripts/generate_manifest.py'], {cwd: __dirname, stdio: 'inherit'});
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            if (result.errors.length === 0) {
                const destination = path.join(__dirname, 'dist/runtime');
                fs.mkdirSync(destination, {recursive: true});
                for (const name of runtime_files) {
                    fs.copyFileSync(path.join(runtime_directory, name), path.join(destination, name));
                }
            }
            result.errors.forEach(({text, location}) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};

async function main() {
    const ctx = await esbuild.context({
        entryPoints: [
            'src/extension.ts'
        ],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [

            esbuildProblemMatcherPlugin,
        ],
    });
    const webview = await esbuild.context({
        entryPoints: {
            scene: path.join(webview_directory, 'scene_main.ts'),
        },
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        outdir: 'dist/webview',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        plugins: [{
            name: 'webview-assets',
            setup(build) {
                const stylesheet = path.join(webview_directory, 'simulation.css');
                build.onLoad({filter: /[\\/]webview[\\/]scene_main\.ts$/}, args => ({
                    contents: fs.readFileSync(args.path, 'utf8'), loader: 'ts', watchFiles: [stylesheet]
                }));
                build.onEnd(result => {
                    if (result.errors.length === 0) {
                        const destination = path.join(__dirname, 'dist/webview');
                        fs.mkdirSync(destination, {recursive: true});
                        fs.copyFileSync(stylesheet, path.join(destination, 'simulation.css'));
                        for (const name of ['results.js', 'results.js.map']) {
                            fs.rmSync(path.join(destination, name), {force: true});
                        }
                        console.log('[webview] build finished');
                    }
                });
            }
        }]
    });
    if (watch) {
        await Promise.all([ctx.watch(), webview.watch()]);
    } else {
        try {
            await Promise.all([ctx.rebuild(), webview.rebuild()]);
        } finally {
            await Promise.all([ctx.dispose(), webview.dispose()]);
        }
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
