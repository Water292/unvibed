#!/usr/bin/env bash
# The one setup command for unvibed. Safe to re-run.
#
# Everything the repo needs is declared in files in the repo:
#   mise.toml          tool versions (node, gh) and tasks
#   package-lock.json  npm dependencies
# This script installs what mise can't (Apple's Command Line Tools, for git)
# and mise itself (pinned by version and hash), then hands over to mise.
# The only input it may ask for: your password (sudo: macOS's Command Line
# Tools, Linux's libraries for the e2e tests' browser) and a browser click to
# log gh in.
set -euo pipefail

MISE_VERSION="2026.9.18"
# SHA-256 of each platform's release tarball; bump together with MISE_VERSION.
mise_sha256() {
  case "$1" in
    macos-arm64) echo "b3539de1a9823505269481b71d09a9cf86e141c63ebfc6101b3cf561766a83e8" ;;
    macos-x64) echo "e1fd0d0a7c93428cc4eaf61a0bdb26f0a50d4401283458c1182d3dcc6fb9b234" ;;
    linux-arm64) echo "4a06b8cc295390e606b9103a29a3b49a1efba75092b05c8aca56b8367f636b37" ;;
    linux-x64) echo "4312f8fd72a8d6a869cd2aca7444929e2a0ef6f45d2c6f2866a1eacc5bdc2e84" ;;
  esac
}

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$HOME/.local/bin"
MISE="$BIN/mise"
INTERACTIVE=$([[ -t 0 && -z "${CI:-}" ]] && echo 1 || echo "")

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31mxx  %s\033[0m\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os="macos" ;;
  Linux) os="linux" ;;
  *) die "Unsupported OS: $(uname -s)" ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch="arm64" ;;
  x86_64) arch="x64" ;;
  *) die "Unsupported CPU: $(uname -m)" ;;
esac

# --- git -------------------------------------------------------------------
# On macOS /usr/bin/git exists even without the Command Line Tools, but only
# as a stub that opens Apple's installer dialog, so check that it really runs.
if ! xcode-select -p >/dev/null 2>&1 && [[ "$os" == "macos" ]]; then
  say "Installing Apple's Command Line Tools (git, clang). sudo will ask for your password."
  # Makes softwareupdate list the Command Line Tools (same trick Homebrew uses).
  marker="/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress"
  touch "$marker"
  label="$(softwareupdate --list 2>/dev/null \
    | sed -n 's/^ *\* Label: \(Command Line Tools.*\)$/\1/p' | sort -V | tail -n 1)"
  [[ -n "$label" ]] || { rm -f "$marker"; die "softwareupdate did not offer the Command Line Tools."; }
  sudo softwareupdate --install "$label" --verbose
  sudo xcode-select --switch /Library/Developer/CommandLineTools
  rm -f "$marker"
fi
git --version >/dev/null 2>&1 || die "git is missing: install it with your package manager, then re-run."
say "$(git --version)"

# --- mise ------------------------------------------------------------------
if [[ "$("$MISE" --version 2>/dev/null || true)" != "$MISE_VERSION "* ]]; then
  say "Installing mise $MISE_VERSION"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  name="mise-v$MISE_VERSION-$os-$arch.tar.gz"
  curl -fsSL "https://github.com/jdx/mise/releases/download/v$MISE_VERSION/$name" -o "$tmp/$name"
  echo "$(mise_sha256 "$os-$arch")  $tmp/$name" | shasum -a 256 -c --status - \
    || die "mise download does not match the hash pinned in this script"
  tar -xzf "$tmp/$name" -C "$tmp"
  mkdir -p "$BIN"
  install -m 0755 "$tmp/mise/bin/mise" "$MISE"
fi
say "mise $("$MISE" --version)"

# --- tools and dependencies (declared in mise.toml / package-lock.json) ----
cd "$REPO_DIR"
"$MISE" trust --quiet "$REPO_DIR/mise.toml"
say "mise install"
"$MISE" install
say "mise run install"
"$MISE" run install
if [[ "$os" == "linux" ]]; then
  # The browser the e2e tests drive needs system libraries macOS already has; this installs them with apt (sudo).
  say "Installing the e2e browser's system libraries. sudo may ask for your password."
  "$MISE" exec -- npx playwright install-deps chromium
fi

# --- shell activation, so `node`, `gh` and `mise` are on PATH --------------
case "$(basename "${SHELL:-}")" in
  zsh) rc="$HOME/.zshrc"; activate='eval "$("$HOME/.local/bin/mise" activate zsh)"' ;;
  bash) rc="$HOME/.bashrc"; activate='eval "$("$HOME/.local/bin/mise" activate bash)"' ;;
  *) rc="" ;;
esac
if [[ -n "$rc" && -n "$INTERACTIVE" ]] && ! grep -qsF "$activate" "$rc"; then
  printf '\n# added by unvibed scripts/setup.sh\n%s\n' "$activate" >> "$rc"
  say "Activated mise in $rc (open a new terminal to pick it up)."
fi

# --- GitHub login (only needed to create repos and PRs, not to build) ------
if "$MISE" exec -- gh auth status >/dev/null 2>&1; then
  say "gh: logged in"
elif [[ -n "$INTERACTIVE" ]]; then
  say "Logging gh in to GitHub: your browser will open; approve it there."
  "$MISE" exec -- gh auth login --hostname github.com --git-protocol https --web
  "$MISE" exec -- gh auth setup-git
else
  say "gh: not logged in (fine for building and testing)."
fi

say "mise run check"
"$MISE" run check

say "Setup done."
