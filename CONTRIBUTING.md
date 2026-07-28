# Contributing to OmniDB

We love your input! We want to make contributing to this project as easy and
transparent as possible, whether it's:

- Reporting a bug
- Asking questions
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer


## OmniDB Database Support

Currently OmniDB supports `PostgreSQL`, `Oracle`, `MySQL` and `MariaDB`.
Suggestions and even pull requests for other databases are welcome.


## OmniDB Operating System Support

We currently build OmniDB for Debian, CentOS, Windows and OSX. Deployment for
different Linux distributions such as openSUSE, Arch Linux, Gentoo and RaspBian
is in our roadmap, but it requires time. You can suggest other operating systems
or architectures and even perform pull requests, we will appreciate that.


## OmniDB Repositories

- [https://github.com/heptau/omnidb](https://github.com/heptau/omnidb): Main
application and server, deployment scripts and tests, documentation.
- [https://github.com/OmniDB/monitors](https://github.com/OmniDB/monitors)
Monitors (charts, grids) for the Monitoring Dashboard.
- [https://github.com/OmniDB/plugins](https://github.com/OmniDB/plugins): OmniDB
official plugins.


## We Develop with Github

We use GitHub to host code, to track issues and feature requests, as well as
accept pull requests.

1. Fork the repo.
2. Checkout `dev` branch.
3. If you've added code that should be tested, add tests.
4. If you've changed APIs, update the documentation.
5. Ensure the test suite passes.
5. Issue that pull request to the `dev` branch.

Note that the `dev` branch is only used in the main repo. For other repos, issue
your pull request to the `master` branch.


## Use Conventional Commits

All commit messages must be written in English using the
[Conventional Commits](https://www.conventionalcommits.org/) format. This keeps
the project history easier to read and helps maintainers understand the intent
of each change.

Examples:

- `feat: add DuckDB connection support`
- `fix: handle empty query results`
- `docs: update installation instructions`


## Go Code Formatting

All Go code must be formatted with `gofmt` (using the `gofmt -s` simplification
flag is recommended). Unformatted code will be rejected by CI.


## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be
under the same [MIT License](http://choosealicense.com/licenses/mit/) that
covers the project. Feel free to contact the maintainers if that's a concern.


## Versioning

We use a single `VERSION` file in the root of the repository as the single
source of truth for the app version. `make _sync_version` (run automatically
as part of the release process below) propagates it into
`go-server/version.go` and `wails-app/frontend/index.html`.

## Releasing

Releases are cut with a single command, run from an up-to-date `master`:

```bash
make release VERSION=X.Y.Z
```

Before running it, make sure `CHANGELOG.md` has real content under
`## [Unreleased]` — the command refuses to run if that section is empty, or
if `X.Y.Z` already has an entry in the changelog (both would otherwise produce
an empty or duplicate GitHub Release).

What it does, in order:

1. `prepare-release` (`scripts/prepare_release.sh`): writes `X.Y.Z` into
   `VERSION`, renames `## [Unreleased]` in `CHANGELOG.md` to
   `## [X.Y.Z] - <today>`, adds a fresh empty `## [Unreleased]` above it for
   the next cycle, extracts that version's notes into
   `build/release-notes.md`, syncs the version into the Go/HTML files, and
   commits + pushes all of it as a single `chore(release): vX.Y.Z` commit.
2. Builds every platform **locally** (`scripts/release.sh`) — no GitHub
   Actions involved in producing binaries:
   - `make build-mac-arm64` / `make build-mac-intel` — native Wails builds
     for Apple Silicon and Intel.
   - `make build-win` — cross-compiles for Windows (Wails' pure-Go WebView2
     loader supports this from macOS).
   - `make build-linux-docker` — builds the Linux binary inside a Docker
     container (`scripts/docker/linux-build.Dockerfile`). This is the one
     platform that genuinely cannot be cross-compiled: Wails' Linux webview
     is a real GTK3/webkit2gtk CGO binding, so it has to be built on Linux —
     Docker gets you that without needing a second machine or a CI runner.
3. Computes `checksums.txt` for all four archives and regenerates the
   Homebrew Cask (`scripts/gen_cask.sh`).
4. Creates and pushes the git tag `vX.Y.Z`.
5. Creates the GitHub Release via `gh release create`, using
   `build/release-notes.md` as the release body, and uploads all four
   platform archives plus `checksums.txt`.
6. Updates the Cask file in `heptau/homebrew-tap` via `gh api`.

### Prerequisites

- Docker running locally (used only for the Linux build step).
- [`gh`](https://cli.github.com/) installed and authenticated
  (`gh auth login`) with an account that has push access to both this repo
  and `heptau/homebrew-tap`.
- A clean working tree on `master`, up to date with `origin/master`.

### Caveat

The Intel macOS build cross-compiles from Apple Silicon. If that ever stops
working reliably, build it on an actual Intel Mac instead and skip that step
in `scripts/release.sh`.

To run just the version bump without building/publishing anything, use
`make prepare-release VERSION=X.Y.Z`.

## Report bugs using Github's [issues](https://github.com/heptau/omnidb/issues)

We use GitHub issues to track public bugs. Report a bug by
[opening a new issue](https://github.com/heptau/omnidb/issues/new); it's that
easy!


## Write bug reports with detail

**Great Bug Reports** tend to have:

- A quick summary and/or background
- OmniDB flavor you are using (app or server) and version
- Operating system and version
- Steps to reproduce
	- Be specific!
	- Give sample code if you can.
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)
