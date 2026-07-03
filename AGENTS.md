# AI Context File for OmniDB

## Project Overview

**Project Name:** OmniDB
**Repository:** https://github.com/heptau/omnidb
**Official Website:** https://www.omnidb.net (downloads, docs, news — deployed from `docs/`)
**What it is:** A desktop database management tool (SQL editor, schema browser, data grid, user/connection management) with strong PostgreSQL support and compatibility with MySQL, MariaDB, Oracle, SQLite and others.

The actual app is a **Django web application** (`OmniDB/`) wrapped in a native desktop **shell** (`wails-app/`, Go/Wails) that spawns the Django server as a local subprocess and points a window at `http://localhost:<port>`.

The desktop shell used to be NW.js; it was fully replaced by Wails (see "Wails migration" below) and the NW.js code has been deleted — there is no fallback if Wails has problems on a given platform, that was a deliberate choice.

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
├── wails-app/                 # The desktop shell (Go/Wails). See "Wails migration" below.
│   ├── main.go, app.go, backend.go
│   └── frontend/              # Loading screen only — no persistent chrome once the
│                              # real app loads (see below for why).
├── Makefile                   # Build system (see "Building" below)
├── docs/                      # Public website source, deployed to omnidb.net
├── scripts/                   # Release/packaging helper scripts (Homebrew cask, etc.)
├── deploy/macosx/mac-icon.icns # macOS app icon (source asset for wails-app/build/appicon.png)
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
- **Desktop shell:** Wails v2 (Go) — see `wails-app/`.
- **Packaging:** PyInstaller bundles `omnidb-server.py` into a standalone binary
  per-platform; the Makefile then wraps that binary + the Wails shell into a
  platform-native app bundle.

## Desktop app mode ("-A" flag)

`omnidb-server.py -A` is how the shell starts the backend. In this mode:

- `DESKTOP_MODE = True`, and a random `APP_TOKEN` is generated at startup.
- Once the CherryPy server is listening, it prints a line to stdout starting with
  `http`: `http://localhost:<port>/omnidb_login/?user=admin&pwd=admin&token=<APP_TOKEN>`.
  `wails-app/backend.go` watches subprocess stdout for a line starting with `http`
  and navigates the window to it — **never log/display this line**, it carries a
  live auth token.
- That URL auto-authenticates as the `admin` user (created by a data migration,
  `OmniDB_app/migrations/0001_3_0_0.py`, with a real Django password `admin`) via
  `OmniDB_app/views/login.py:sign_in_automatic`. This is why the desktop app never
  shows a manual login form in normal use — only the web/server deployment does.
- The manual login form (`sign_in`) is intentionally disabled whenever `APP_TOKEN`
  is set, so desktop mode can't be used to brute-force a different account.

## Building

```bash
source venv/bin/activate                      # see Gotchas — keep this in sync!
export PATH="$PATH:$(go env GOPATH)/bin"      # needed to get the `wails` CLI on PATH

make build-mac-arm64    # Apple Silicon
make build-linux        # Linux x64 — must run ON Linux, see Wails migration notes
make build-win          # Windows x64 — Go/Wails part cross-compiles, PyInstaller doesn't
```

`make help` lists everything. PyInstaller cannot cross-compile — each platform must
be built on that platform (or via CI, see `.github/workflows/release.yml`).

## Wails migration — current status

The desktop shell was migrated from NW.js to Wails (Go), keeping the Django
backend and all its frontend JS/HTML completely unchanged. Rationale: smaller
binary, no bundled Chromium, native OS webview. Still on branch
`feature/wails-migration`, not yet merged to `master`.

**What's different from the old NW.js shell, architecturally, and why (useful
context if something about window/login behavior looks odd):**

- NW.js's `<webview>` tag was a fully independent browsing context (its own
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
- `wails-app/backend.go` replicates the old NW.js shell's subprocess
  spawn/env/kill logic (`buildServerSpawnOptions` → `buildServerEnv`, including
  macOS `DYLD_LIBRARY_PATH` for bundled psycopg2).
- macOS bundle identifier is `net.omnidb` — the same one the NW.js builds used,
  so this replaces the existing installed app cleanly rather than coexisting
  with it (Launch Services, preferences, etc. all key off this).

**Verification status — important, don't assume this is all equally solid:**

- **macOS**: verified end-to-end against a real server (real login, real
  workspace, clean process shutdown on window close).
- **Linux and Windows**: the Go/Wails code is believed correct
  (`resolveServerDir()`/`serverExecutableName()` already handle non-darwin
  paths and `.exe` naming) but **has never run on real Linux or Windows
  hardware**. `wails build -platform linux/amd64` outright refuses to
  cross-compile from macOS; Windows cross-compiles fine from macOS for the
  Go/Wails part (verified — produces a real PE32+ .exe) but PyInstaller still
  can't cross-compile the server binary. `.github/workflows/release.yml` now
  builds both live on GitHub-hosted runners — that CI run is the first real
  test either of these gets. If a release comes back broken on one of these
  platforms, that's why: there is no NW.js fallback anymore, by design.

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

- The desktop shell is Wails (`wails-app/`) — there is no NW.js code left in
  the repo to consider.
- Backend/frontend code in `OmniDB/` is shared with whatever shell runs it;
  changes there affect the whole app, so test through the actual Wails build
  when the change touches anything shell-adjacent (login, window lifecycle).
- Treat anything under `OmniDB_app.Connection` (saved DB connections) and the
  `~/.omnidb` home directory as sensitive — ask before resetting, deleting, or
  bulk-modifying real installed data.
- The public website in `docs/` should describe what's actually shipped.
