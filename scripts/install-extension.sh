#!/usr/bin/env bash

# Fail fast:
# -e  stop immediately on command errors
# -u  error on unset variables
# -o pipefail  fail the whole pipeline if any command in it fails
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Pull package metadata from package.json so the script always stays aligned
# with the extension manifest.
PACKAGE_NAME="$(
  node -e '
    const pkg = require(process.argv[1]);
    process.stdout.write(pkg.name);
  ' "${REPO_DIR}/package.json"
)"
PACKAGE_VERSION="$(
  node -e '
    const pkg = require(process.argv[1]);
    process.stdout.write(pkg.version);
  ' "${REPO_DIR}/package.json"
)"

# The vsce version is pinned so local builds and CI builds are consistent.
VSCE_VERSION="3.3.0"
DIST_DIR="${REPO_DIR}/dist"
ROOT_VSIX="${REPO_DIR}/${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix"
DEFAULT_VSIX="${DIST_DIR}/${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix"

TARGET="both"
FORCE=0
PACKAGE_ONLY=0
BUILD=0
VSIX_PATH=""

usage() {
    cat <<EOF
Usage: $0 [vscode|cursor|both] [options]

Options:
  --force, -f         Pass --force to the editor CLI during installation.
  --build             Build a fresh VSIX with vsce even if a prebuilt one exists.
  --package-only      Only resolve/build the VSIX and print its path.
  --vsix <path>       Install a specific prebuilt VSIX.
  --help, -h          Show this help text.

Examples:
  $0
  $0 vscode
  $0 cursor --force
  $0 both --build
  $0 --package-only --build
  $0 vscode --vsix ./dist/${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix
EOF
}

# Parse arguments in any order.
while [[ $# -gt 0 ]]; do
    case "$1" in
        vscode|cursor|both|all)
            TARGET="$1"
            shift
            ;;
        --force|-f)
            FORCE=1
            shift
            ;;
        --build)
            BUILD=1
            shift
            ;;
        --package-only)
            PACKAGE_ONLY=1
            shift
            ;;
        --vsix)
            if [[ $# -lt 2 ]]; then
                echo "Missing path after --vsix"
                usage
                exit 1
            fi
            VSIX_PATH="$2"
            shift 2
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1"
            usage
            exit 1
            ;;
    esac
done

find_prebuilt_vsix() {
    # Highest priority: an explicit VSIX path passed by the caller.
    if [[ -n "${VSIX_PATH}" ]]; then
        if [[ -f "${VSIX_PATH}" ]]; then
            printf '%s\n' "${VSIX_PATH}"
            return 0
        fi

        echo "The VSIX passed to --vsix was not found: ${VSIX_PATH}"
        return 1
    fi

    local candidates=()

    # Next: common artifact locations/names for local builds or CI-produced files.
    candidates+=(
        "${DEFAULT_VSIX}"
        "${ROOT_VSIX}"
        "${REPO_DIR}/${PACKAGE_NAME}.vsix"
    )

    local candidate
    for candidate in "${candidates[@]}"; do
        if [[ -f "${candidate}" ]]; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    done

    # Last resort: any matching VSIX in the repo root or dist directory.
    local discovered=""
    discovered="$(find "${REPO_DIR}" -maxdepth 2 -type f \( -name "${PACKAGE_NAME}*.vsix" -o -path "${DIST_DIR}/*.vsix" \) | sort | head -n 1 || true)"
    if [[ -n "${discovered}" ]]; then
        printf '%s\n' "${discovered}"
        return 0
    fi

    return 1
}

build_vsix() {
    if ! command -v npx >/dev/null 2>&1; then
        echo "Cannot build a VSIX locally because npx is not available."
        return 1
    fi

    mkdir -p "${DIST_DIR}"

    echo "Building VSIX with vsce ${VSCE_VERSION}..." >&2
    (
        cd "${REPO_DIR}"
        npx --yes "@vscode/vsce@${VSCE_VERSION}" package \
            --allow-star-activation \
            --allow-missing-repository \
            >&2
    )

    if [[ ! -f "${ROOT_VSIX}" ]]; then
        echo "vsce finished but did not produce ${ROOT_VSIX}" >&2
        return 1
    fi

    cp -f "${ROOT_VSIX}" "${DEFAULT_VSIX}"
    printf '%s\n' "${DEFAULT_VSIX}"
}

resolve_vsix() {
    local resolved=""

    # An explicit --vsix path is a contract: use that exact file or fail.
    if [[ -n "${VSIX_PATH}" ]]; then
        if resolved="$(find_prebuilt_vsix)"; then
            printf '%s\n' "${resolved}"
            return 0
        fi
        return 1
    fi

    # If the caller did not force a rebuild, prefer an existing artifact first.
    if [[ "${BUILD}" -eq 0 ]]; then
        if resolved="$(find_prebuilt_vsix)"; then
            printf '%s\n' "${resolved}"
            return 0
        fi
    fi

    # Build only when requested or when no prebuilt package could be found.
    if resolved="$(build_vsix)"; then
        printf '%s\n' "${resolved}"
        return 0
    fi

    echo "No installable VSIX found."
    echo "Either:"
    echo "  1. provide one with --vsix <path>,"
    echo "  2. place a CI-built VSIX in the repo root or dist/, or"
    echo "  3. install Node/npm+npx and re-run with --build."
    return 1
}

install_target() {
    local app_name="$1"
    local cli_name="$2"
    local vsix="$3"

    if ! command -v "${cli_name}" >/dev/null 2>&1; then
        echo "Skipping ${app_name}: CLI not found."
        return 0
    fi

    local args=(--install-extension "${vsix}")
    if [[ "${FORCE}" -eq 1 ]]; then
        args+=(--force)
    fi

    echo "Installing ${vsix} into ${app_name}..."
    "${cli_name}" "${args[@]}"
}

VSIX_TO_INSTALL="$(resolve_vsix)"

if [[ "${PACKAGE_ONLY}" -eq 1 ]]; then
    # Package-only mode is useful for CI, release steps, or for end users who
    # just need the ready-to-install artifact path and do not want to install.
    printf '%s\n' "${VSIX_TO_INSTALL}"
    exit 0
fi

echo "Using VSIX: ${VSIX_TO_INSTALL}"

case "${TARGET}" in
    vscode)
        install_target "VS Code" "code" "${VSIX_TO_INSTALL}"
        ;;
    cursor)
        install_target "Cursor" "cursor" "${VSIX_TO_INSTALL}"
        ;;
    both|all)
        install_target "VS Code" "code" "${VSIX_TO_INSTALL}"
        install_target "Cursor" "cursor" "${VSIX_TO_INSTALL}"
        ;;
    *)
        usage
        exit 1
        ;;
esac
