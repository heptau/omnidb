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

```bash
# Clone and setup
git clone https://github.com/heptau/omnidb.git
cd omnidb

# Install dependencies
pip install -r requirements.txt

# Run migrations
cd OmniDB
python manage.py migrate

# Start server
python manage.py runserver
```

## Build

```bash
# Build for current platform
make build

# Build for all platforms
make build-all
```

## Tech Stack

- **Backend**: Python, Django 5+
- **Frontend**: HTML, CSS, JavaScript (NW.js)
- **Database**: PostgreSQL, SQLite
- **Libraries**: ACE Editor, AG Grid, Chart.js, Bootstrap

## Requirements

- Python 3.10+
- PostgreSQL (optional, for backend storage)
- See `requirements.txt` for full dependencies

## License

MIT License - See LICENSE file

## Screenshots

![Dashboard](https://raw.githubusercontent.com/docs/assets/dashboard.png)
