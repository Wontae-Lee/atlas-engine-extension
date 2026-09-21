from pathlib import Path
import sys


TARGET_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".jsonc",
}

EXCLUDED_DIRS = {
    "node_modules",
    ".git",
    ".vscode-test",
    "dist",
    "out",
    "build",
}


def remove_comments(text: str) -> str:
    result = []

    i = 0
    n = len(text)

    in_string = False
    string_char = None
    escape = False

    while i < n:
        char = text[i]

        # String 내부
        if in_string:
            result.append(char)

            if escape:
                escape = False

            elif char == "\\":
                escape = True

            elif char == string_char:
                in_string = False
                string_char = None

            i += 1
            continue

        # String 시작
        if char in ('"', "'", "`"):
            in_string = True
            string_char = char
            result.append(char)
            i += 1
            continue

        # //
        if (
                char == "/"
                and i + 1 < n
                and text[i + 1] == "/"
        ):
            i += 2

            while i < n and text[i] != "\n":
                i += 1

            # line number 유지
            if i < n:
                result.append("\n")
                i += 1

            continue

        # /* ... */
        if (
                char == "/"
                and i + 1 < n
                and text[i + 1] == "*"
        ):
            i += 2

            while i < n:
                if (
                        i + 1 < n
                        and text[i] == "*"
                        and text[i + 1] == "/"
                ):
                    i += 2
                    break

                # line number 유지
                if text[i] == "\n":
                    result.append("\n")

                i += 1

            continue

        result.append(char)
        i += 1

    return "".join(result)


def should_skip(path: Path) -> bool:
    return any(
        part in EXCLUDED_DIRS
        for part in path.parts
    )


def process_file(path: Path):
    try:
        original = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        print(f"[SKIP] Cannot decode: {path}")
        return

    cleaned = remove_comments(original)

    if cleaned == original:
        print(f"[NO CHANGE] {path}")
        return

    path.write_text(cleaned, encoding="utf-8")

    print(f"[CLEANED] {path}")


def process_directory(root: Path):
    count = 0

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        if should_skip(path):
            continue

        if path.suffix.lower() not in TARGET_EXTENSIONS:
            continue

        process_file(path)
        count += 1

    print()
    print(f"Processed {count} files.")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        root = Path(sys.argv[1]).resolve()
    else:
        root = Path(__file__).resolve().parent.parent

    if not root.exists():
        print(f"Directory does not exist: {root}")
        sys.exit(1)

    print(f"Root: {root}")
    print()

    process_directory(root)