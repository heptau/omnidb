# AI Context File for OmniDB

## Project Overview

**Project Name:** OmniDB
**Repository:** https://github.com/heptau/omnidb
**Official Website:** https://www.omnidb.net (downloads, docs, news — deployed from `docs/`)
**What it is:** A desktop database management tool (SQL editor, schema browser, data grid, user/connection management) with strong PostgreSQL support and compatibility with MySQL, MariaDB, Oracle, SQLite and others.

The actual app is a **Django web application** (`OmniDB/`) wrapped in a native desktop **shell** that spawns the Django server as a local subprocess and points a window at `http://localhost:<port>`. There are currently **two shells in the repo**: NW.js (shipped today) and Wails/Go (in-progress replacement, not yet merged to `master`).

## Real Project Structure

```
omnidb/
├── OmniDB/                    # Django project — the actual application
│   ├── manage.py              # Standard Django management commands (dev use)
│   ├── omnidb-server.py       # REAL production entrypoint: runs migrations, then
│   │                          # serves the Django app via CherryPy's WSGI server.
│   │                          # PyInstaller-compiled into a standalone "omnidb-server"
│   │                          # binary for desktop packaging.
│   ├── OmniDB/                # Django settings/urls/custom_settings.py
│   └── OmniDB_app/            # The actual application: views, models, static JS/CSS,
│                              # templates, DB drivers (OmniDB_app/include/OmniDatabase)
├── deploy/app/                # NW.js desktop shell — CURRENTLY SHIPPED.
│   ├── index.html             # The entire shell: loading screen, custom frameless
│   │                          # titlebar, spawns omnidb-server as a child_process,
│   │                          # loads its URL into a <webview> tag.
│   └── package.json           # NW.js window config (frameless, chromium-args)
├── wails-app/                 # Wails (Go) desktop shell — IN PROGRESS, macOS only,
│   │                          # not yet merged/shipped. See "Wails migration" below.
│   ├── main.go, app.go, backend.go
│   └── frontend/              # Loading screen only — no persistent chrome once the
│                              # real app loads (see below for why).
├── Makefile                   # Build system for both shells (see "Building" below)
├── docs/                      # Public website source, deployed to omnidb.net
├── scripts/                   # Release/packaging helper scripts (Homebrew cask, etc.)
├── deploy/windows/, deploy/linux/  # Legacy/secondary deploy scripts for those OSes
├── requirements.txt           # Python deps — keep venv in sync with this (see Gotchas)
└── venv/                      # Project's own virtualenv (not committed)
```

## Technology Stack

- **Backend:** Python, Django 5+, served via CherryPy's WSGI server (not `runserver`)
- **App database:** SQLite, storing users, saved connections (with credentials),
  snippets, query history etc. Lives in a per-install home dir — see "Desktop app
  mode" below. This is **separate** from whatever database (Postgres/MySQL/...) the
  user is actually managing.
- **Frontend:** Server-rendered Django templates + jQuery-era JS/CSS under
  `OmniDB/OmniDB_app/static/` (ACE editor, AG Grid-like table, Bootstrap). No SPA
  framework, no build step for the frontend itself.
- **Desktop shell (current):** NW.js — see `deploy/app/index.html`.
- **Desktop shell (in progress):** Wails v2 (Go) — see `wails-app/`.
- **Packaging:** PyInstaller bundles `omnidb-server.py` into a standalone binary
  per-platform; the Makefile then wraps that binary + the chosen shell into a
  platform-native app bundle.

## Desktop app mode ("-A" flag)

`omnidb-server.py -A` is how both shells start the backend. In this mode:

- `DESKTOP_MODE = True`, and a random `APP_TOKEN` is generated at startup.
- Once the CherryPy server is listening, it prints a line to stdout starting with
  `http`: `http://localhost:<port>/omnidb_login/?user=admin&pwd=admin&token=<APP_TOKEN>`.
  Both shells watch subprocess stdout for a line starting with `http` and navigate
  to it — **never log/display this line**, it carries a live auth token.
- That URL auto-authenticates as the `admin` user (created by a data migration,
  `OmniDB_app/migrations/0001_3_0_0.py`, with a real Django password `admin`) via
  `OmniDB_app/views/login.py:sign_in_automatic`. This is why the desktop app never
  shows a manual login form in normal use — only the web/server deployment does.
- The manual login form (`sign_in`) is intentionally disabled whenever `APP_TOKEN`
  is set, so desktop mode can't be used to brute-force a different account.

## Building

```bash
source venv/bin/activate                      # see Gotchas — keep this in sync!
export PATH="$PATH:$(go env GOPATH)/bin"      # needed for the Wails target only

make build-mac-arm64          # NW.js shell, Apple Silicon — currently shipped
make build-mac-intel          # NW.js shell, Intel
make build-linux              # NW.js shell, Linux x64
make build-win                # NW.js shell, Windows x64
make build-mac-wails-arm64    # Wails shell, Apple Silicon — in progress, macOS only
```

`make help` lists everything. PyInstaller cannot cross-compile — each platform must
be built on that platform (or via CI, see `.github/workflows/release.yml`).

## Wails migration — current status

A branch (`feature/wails-migration`) is replacing the NW.js shell with a Wails
(Go) one, keeping the Django backend and all its frontend JS/HTML completely
unchanged. Rationale: smaller binary, no bundled Chromium, native OS webview.

**What's different from NW.js, architecturally, and why:**

- NW.js's `<webview>` tag is a fully independent browsing context (its own
  process, its own cookie jar treated as first-party, no `X-Frame-Options`
  restriction). Wails has no equivalent element — its webview *is* the single
  top-level page.
- An `<iframe>`-based shell (custom titlebar + embedded app) was tried and
  reverted: Django's session cookie gets silently dropped by WKWebView because
  it treats iframed content as third-party, even with `SameSite=None; Secure;
  Partitioned` rewriting. The login redirect succeeds server-side but the
  session never sticks client-side.
- Current approach: the Wails window shows a loading screen, then does a full
  top-level `window.location.href` navigation to the backend URL once ready —
  same-origin, no cookie issues, but **no persistent custom titlebar** (Wails
  can't inject chrome that survives a full top-level navigation the way NW.js's
  host page could keep a `<webview>` embedded). The window uses the native OS
  frame instead.
- `wails-app/backend.go` replicates the NW.js shell's subprocess spawn/env/kill
  logic (`buildServerSpawnOptions` → `buildServerEnv`, including macOS
  `DYLD_LIBRARY_PATH` for bundled psycopg2).

**Not yet done:** Linux/Windows Wails packaging (`resolveServerDir()` has a
generic non-darwin branch but it's untested); merging to `master`.

## Gotchas learned the hard way

- **Keep `venv/` in sync with `requirements.txt`.** A stale venv (seen with
  Django 4.2.27 + social-auth-app-django 5.4.1, both below the pins) breaks
  `manage.py migrate` / `omnidb-server.py` with
  `KeyError: ('social_django', 'code')` on the very first migration, because
  that library's squashed initial migration doesn't apply cleanly on older
  Django. Fix: `pip install --upgrade -r requirements.txt`.
- **`.gitignore`'s `build`/`build_deps`/`build_work` entries must stay anchored**
  (`/build`, not `build`) — an unanchored pattern also matches `wails-app/build/`,
  which is real Wails project source (Info.plist templates, app icon), not
  build output.
- **Never touch `~/.omnidb/` without asking.** That's where the real,
  installed app's SQLite DB lives (`~/.omnidb/omnidb-server/omnidb.db` in
  desktop mode), including any saved database connections and credentials the
  user actually has. For local testing, use `-d <some throwaway dir>` on
  `omnidb-server.py`/the built `omnidb-server` binary instead of the default.
- **PyInstaller builds are OS/arch-specific to the machine that ran them** —
  there's no cross-compilation; don't assume a Mac-built server binary works
  elsewhere.

## Instructions for AI assistants

- Don't assume NW.js is the only shell anymore — check whether a change belongs
  in `deploy/app/` (current shell), `wails-app/` (in-progress shell), or both.
- Backend/frontend code in `OmniDB/` is shared by both shells; changes there
  affect whichever shell is running, so test with whichever one is relevant to
  the task (or both, if touching shared behavior like the login flow).
- Treat anything under `OmniDB_app.Connection` (saved DB connections) and the
  `~/.omnidb` home directory as sensitive — ask before resetting, deleting, or
  bulk-modifying real installed data.
- The public website in `docs/` should describe what's actually shipped;
  don't announce unfinished migration work there as if it were done.
