# OmniDB

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/heptau/omnidb.svg?label=Release)](https://github.com/heptau/omnidb/releases)
[![Install with Homebrew](https://img.shields.io/badge/install%20with-Homebrew-orange?logo=homebrew&logoColor=white)](https://www.omnidb.net#installation)
[![docs](https://img.shields.io/badge/docs-OmniDB.net-darkgreen?logo=read-the-docs&logoColor=white&label=Docs)](https://www.omnidb.net)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-9.2%2B-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

A user-friendly, lightweight, cross-platform database management tool with strong support for PostgreSQL and compatibility with several other databases.

**Website**: https://www.omnidb.net

## Features

- **Multi-Database Support**: PostgreSQL, MySQL, MariaDB, SQLite, Oracle, SQL Server, Firebird, IBM DB2
- **Cross-Platform**: Runs on Windows, macOS, and Linux
- **Modern UI**: Dark/Light theme with automatic OS preference detection
- **Advanced SQL Editor**: Syntax highlighting, auto-completion, code formatting
- **Visual Explain**: Graphical display of query execution plans
- **SSH Tunneling**: Secure database connections via SSH
- **User Management**: Built-in user system with optional LDAP/Active Directory authentication

## Quick Start

The easiest way to get OmniDB is a prebuilt release — see
[Installation](https://www.omnidb.net#installation) (Homebrew cask on macOS,
or a direct download from
[Releases](https://github.com/heptau/omnidb/releases)).

To build from source:

```bash
git clone https://github.com/heptau/omnidb.git
cd omnidb
export PATH="$PATH:$(go env GOPATH)/bin"   # picks up the Wails CLI once installed

make build-mac-arm64    # macOS Apple Silicon
make build-linux        # Linux x64 — must run ON Linux
make build-win          # Windows x64 — cross-compiles from macOS/Linux
```

Run `make help` for the full list of targets. The only prerequisite is Go —
the Makefile installs the Wails CLI itself if it's missing.

## Tech Stack

- **Backend**: Go — see `go-server/` and `AGENTS.md` for details
- **Frontend**: HTML, CSS, JavaScript (server-rendered, no SPA framework)
- **Desktop shell**: Wails/Go — see `wails-app/` and `AGENTS.md` for details
- **Database**: PostgreSQL, MySQL, MariaDB, Oracle, SQLite
- **Libraries**: ACE Editor, Chart.js, Bootstrap

## Requirements

- Go (to build from source) — see `AGENTS.md` for the exact toolchain notes

## License

MIT License - See LICENSE file

## Screenshots

![OmniDB workspace, light theme](https://raw.githubusercontent.com/heptau/omnidb/master/docs/assets/screenshot.webp)
![OmniDB workspace, dark theme](https://raw.githubusercontent.com/heptau/omnidb/master/docs/assets/screenshot-dark.webp)
