# wails-app

The Wails (Go) desktop shell for OmniDB — an in-progress replacement for the
NW.js shell in `../deploy/app/`. See `../AGENTS.md` for the full picture of
how this fits into the project and why it's built the way it is.

This shell only replaces the desktop wrapper: it spawns the `omnidb-server`
binary as a subprocess, waits for it to report readiness, and navigates the
window to it. All frontend and backend application code lives in `../OmniDB/`
and is unchanged.

## Building

Normally you build this through the root `Makefile`, which also packages the
`omnidb-server` binary into the app bundle:

```bash
cd ..
source venv/bin/activate
export PATH="$PATH:$(go env GOPATH)/bin"
make build-mac-wails-arm64
```

For iterating on just this Go/frontend code without rebuilding the Python
server each time, `wails build` here produces a standalone binary that looks
for `omnidb-server` next to itself (or in `Contents/Resources/omnidb-server`
in a packaged macOS `.app`). To test against a local server build (real or a
throwaway stub script) without the full Makefile pipeline, point it at a
directory via:

```bash
OMNIDB_SERVER_DIR=/path/to/dir/containing/omnidb-server wails build && \
  OMNIDB_SERVER_DIR=/path/to/dir/containing/omnidb-server ./build/bin/OmniDB.app/Contents/MacOS/OmniDB
```

`wails dev` (live reload) also works for iterating on `frontend/`, but note
the frontend here is just the loading screen shown before the window
navigates away to the real (server-rendered) OmniDB UI — there isn't much to
hot-reload beyond that.

## Status

macOS (Apple Silicon) only so far. Not yet merged to `master`; the NW.js
shell in `../deploy/app/` is still what ships.
