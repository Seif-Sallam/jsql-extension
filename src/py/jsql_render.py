#!/usr/bin/env python3
"""Helper for the "JSql: Copy Query with Parameters" command.

Renders a JSql template exactly the way the real ``jsql`` library does at
runtime, then inlines ``:param`` values so the result is a runnable query that
can be pasted into a SQL client.

Communicates with the extension over stdin/stdout as JSON. Two modes:

    discover : in  {"template": "..."}
               out {"jinja_vars": ["..."]}   # free Jinja variables to prompt for

    render   : in  {"template": "...", "params": {...}}
               out {"query": "..."}          # rendered + list-expanded + inlined

Any failure is reported as {"error": "..."} on stdout with a non-zero exit code.
"""

import json
import re
import sys


def emit(payload):
    sys.stdout.write(json.dumps(payload))


def fail(message):
    emit({"error": message})
    sys.exit(1)


def load_jsql():
    try:
        import jsql
        from jinja2 import meta
        return jsql, meta
    except Exception as exc:  # noqa: BLE001 - report any import problem verbatim
        fail(
            "Could not import 'jsql' with this Python interpreter ({}): {}. "
            "Set 'jsqlSyntax.pythonPath' to a venv that has jsql installed.".format(
                sys.executable, exc
            )
        )


def discover(data):
    template = data.get("template", "")
    jsql, meta = load_jsql()

    try:
        ast = jsql.jenv.parse(template)
        jinja_vars = sorted(meta.find_undeclared_variables(ast))
    except Exception:  # noqa: BLE001 - a parse error just means no Jinja vars to prompt
        jinja_vars = []

    reserved = set(jsql.jenv.globals.keys()) | {"bindparam"}
    jinja_vars = [name for name in jinja_vars if name not in reserved]

    emit({"jinja_vars": jinja_vars})


def sub_token(query, name, replacement):
    # Replace :name where it is not part of a longer identifier (so :id leaves
    # :id_user alone). A lambda avoids re backreference interpretation.
    token = re.compile(r":" + re.escape(name) + r"(?![A-Za-z0-9_])")
    return token.sub(lambda _m, r=replacement: r, query)


def render_scalar(value):
    # Used only for jsql-generated binds (bindparam() values and expanded list
    # elements) where there is no user-typed raw string.
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if value is None:
        return "NULL"
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return "'" + str(value).replace("'", "''") + "'"


def tidy_query(query):
    # Drop lines left blank or comment-only after Jinja control tags are rendered.
    result = []
    for line in query.split("\n"):
        if re.fullmatch(r"\s*", line):
            continue
        if re.fullmatch(r"\s*--\s*", line):
            continue
        result.append(line)
    return "\n".join(result)


def normalize_tuple_lists(params):
    # JSON arrays decode as lists; jsql's *_tuple_list path requires tuples.
    for key, value in list(params.items()):
        if key.endswith("_tuple_list") and isinstance(value, list):
            params[key] = [tuple(v) if isinstance(v, list) else v for v in value]


SENTINEL = "\x00"


def render(data):
    template = data.get("template", "")
    context = data.get("context", {})
    raw = data.get("raw", {})
    if not isinstance(context, dict) or not isinstance(raw, dict):
        fail("Render context/raw must be objects.")

    jsql, _ = load_jsql()

    original_keys = set(context.keys())
    params = dict(context)
    normalize_tuple_lists(params)

    # Unfilled :*_list params are left verbatim. Hide them from jsql's list
    # expansion behind a sentinel, then restore afterwards.
    protected = {}
    for key in set(re.findall(r":([A-Za-z_]\w*_list)", template)):
        if key not in params:
            sentinel = SENTINEL + key + SENTINEL
            protected[sentinel] = ":" + key
            template = sub_token(template, key, sentinel)

    try:
        query = jsql.render(template, params)
        query, params = jsql.format_query_with_list_params(query, params)
    except jsql.UnsafeSqlException as exc:
        fail("jsql rejected an unsafe value (use a safe identifier or a :bind param): {}".format(exc))
    except Exception as exc:  # noqa: BLE001
        fail("Render failed: {}".format(exc))

    # 1) User-provided scalar binds -> inserted exactly as typed.
    for name in sorted(raw.keys(), key=len, reverse=True):
        query = sub_token(query, name, str(raw[name]))

    # 2) jsql-generated binds (bindparam() values, expanded list elements).
    generated = set(params.keys()) - original_keys - {"bindparam"}
    for name in sorted(generated, key=len, reverse=True):
        query = sub_token(query, name, render_scalar(params[name]))

    for sentinel, original in protected.items():
        query = query.replace(sentinel, original)

    query = tidy_query(query)
    emit({"query": query})


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except Exception as exc:  # noqa: BLE001
        fail("Invalid JSON input: {}".format(exc))

    if mode == "discover":
        discover(data)
    elif mode == "render":
        render(data)
    else:
        fail("Unknown mode: {}".format(mode))


if __name__ == "__main__":
    main()
