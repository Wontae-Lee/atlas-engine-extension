import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function get_runtime_source(directory: string): string {
	const sources = {
		'__init__.py': '',
		'engine_scene.py': readFileSync(join(directory, 'engine_scene.py'), 'utf8'),
		'engine_session.py': readFileSync(join(directory, 'engine_session.py'), 'utf8'),
		'engine_server.py': readFileSync(join(directory, 'engine_server.py'), 'utf8')
	};

	return `
import os
import sys
import tempfile
from pathlib import Path

protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", buffering=1)
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())

sources = ${JSON.stringify(sources)}
with tempfile.TemporaryDirectory(prefix="atlas-streaming-") as directory:
    package = Path(directory) / "atlas_extension_streaming"
    package.mkdir()
    for name, source in sources.items():
        (package / name).write_text(source, encoding="utf-8")
    sys.path.insert(0, directory)
    from atlas_extension_streaming.engine_server import EngineServer
    EngineServer(protocol).serve()
`;
}
