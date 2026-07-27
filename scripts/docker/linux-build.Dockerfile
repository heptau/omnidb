# =============================================================================
# linux-build.Dockerfile — build environment for `make build-linux-docker`.
#
# Wails' Linux webview is a real GTK3/webkit2gtk CGO binding (unlike the
# pure-Go one used for Windows), so it cannot be cross-compiled from macOS —
# it must be built on Linux. This image lets the release process do that
# locally via Docker instead of relying on a GitHub Actions runner.
# =============================================================================
FROM golang:1.25-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgtk-3-dev \
        libwebkit2gtk-4.1-dev \
        pkg-config \
        build-essential \
        nodejs \
        npm \
        ca-certificates \
        git \
        zip \
    && rm -rf /var/lib/apt/lists/*

ENV GOBIN=/usr/local/bin
RUN go install github.com/wailsapp/wails/v2/cmd/wails@latest

WORKDIR /src
