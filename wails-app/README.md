# wails-app

The Wails (Go) desktop shell for OmniDB — replaces the old NW.js shell
(removed, no fallback). See `../AGENTS.md` for the full picture of how this
fits into the project and why it's built the way it is.

This shell only wraps the backend: it spawns the `omnidb-server` binary
(`../go-server/`) as a subprocess, waits for it to report readiness, and
navigates the window to it. All backend application code lives in
`../go-server/` — there is no other language or process involved.

## Building

Normally you build this through the root `Makefile`, which also packages the
`omnidb-server` binary into the app bundle:

```bash
cd ..
export PATH="$PATH:$(go env GOPATH)/bin"
make build-mac-arm64
```

For iterating on just this Go/frontend code without rebuilding the server
each time, `wails build` here produces a standalone binary that looks for
`omnidb-server` next to itself. To point it at a different server build
without the full Makefile pipeline:

```bash
OMNIDB_SERVER_PATH=/path/to/omnidb-server wails build && \
  OMNIDB_SERVER_PATH=/path/to/omnidb-server ./build/bin/OmniDB.app/Contents/MacOS/OmniDB
```

`wails dev` (live reload) also works for iterating on `frontend/`, but note
the frontend here is just the loading screen shown before the window
navigates away to the real (server-rendered) OmniDB UI — there isn't much to
hot-reload beyond that.

## Status

Not yet merged to `master` (branch `feature/wails-migration`). macOS has been
verified end-to-end against the real Go backend, including a real packaged
`.app` build. Linux and Windows have not run on real hardware yet — see
`../AGENTS.md`'s "Wails migration" section.
