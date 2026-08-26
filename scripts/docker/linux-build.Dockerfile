# =============================================================================
# linux-build.Dockerfile — build environment for `make build-linux-docker`.
#
# Wails' Linux webview is a real GTK3/webkit2gtk CGO binding (unlike the
# pure-Go one used for Windows), so it cannot be cross-compiled from macOS —
# it must be built on Linux. This image lets the release process do that
# locally via Docker instead of relying on a GitHub Actions runner.
# =============================================================================
FROM golang:1.25-bookworm

# Debian bookworm's apt-get nodejs package is stuck on Node 18, but sass
# (via chokidar@5, ESM-only) requires Node >=20.19 — matches CI (tests.yml
# uses Node 22), so pull Node 22 from NodeSource instead of the distro package.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        libgtk-3-dev \
        libwebkit2gtk-4.1-dev \
        pkg-config \
        build-essential \
        nodejs \
        git \
        zip \
    && rm -rf /var/lib/apt/lists/*

ENV GOBIN=/usr/local/bin
RUN go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0

WORKDIR /src
