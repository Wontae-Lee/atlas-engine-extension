#!/usr/bin/env python3
import json
from pathlib import Path
import re
import subprocess


def read_jsonc(path):
    source = path.read_text(encoding="utf-8")
    tokens = re.compile(r'"(?:[^"\\\x00-\x1f]|\\.)*"|//[^\r\n]*|/\*[\s\S]*?\*/')
    source = tokens.sub(
        lambda match: re.sub(r"[^\r\n]", " ", match[0])
        if match[0].startswith("/") else match[0],
        source,
    )
    source = re.sub(
        r'"(?:[^"\\\x00-\x1f]|\\.)*"|,(?=\s*[}\]])',
        lambda match: " " if match[0] == "," else match[0],
        source,
    )

    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate key: {key}")
            result[key] = value
        return result

    def invalid_constant(value):
        raise ValueError(f"Invalid JSON constant: {value}")

    try:
        data = json.loads(source, object_pairs_hook=unique_object, parse_constant=invalid_constant)
    except ValueError as error:
        raise ValueError(f"{path}: {error}") from error
    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return data


def merge(target, source, path):
    for key, value in source.items():
        location = f"{path}.{key}"
        if key not in target:
            target[key] = value
        elif isinstance(target[key], dict) and isinstance(value, dict):
            merge(target[key], value, location)
        elif isinstance(target[key], list) and isinstance(value, list):
            target[key].extend(value)
        else:
            raise ValueError(f"Conflicting manifest setting: {location}")


def generate():
    root = Path(__file__).resolve().parent.parent
    config = root / "config"
    base = config / "package.jsonc"
    manifest = read_jsonc(base)
    for path in sorted(config.rglob("*.jsonc")):
        if path != base:
            merge(manifest, read_jsonc(path), str(path.relative_to(root)))
    result = subprocess.run(
        ["node", str(root / "scripts/read_contributions.cjs")],
        check=True, capture_output=True, text=True,
    )
    merge(manifest, json.loads(result.stdout), "src/atlas/contributions.ts")
    output = json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    destination = root / "package.json"
    if not destination.exists() or destination.read_text(encoding="utf-8") != output:
        destination.write_text(output, encoding="utf-8")
    print("Generated package.json from config and src/atlas/contributions.ts")


if __name__ == "__main__":
    try:
        generate()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.strip()) from error
