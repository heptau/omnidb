# =============================================================================
# nsis-build.Dockerfile — compiles the Windows NSIS installer only.
#
# Exists purely to work around a real bug in Homebrew's makensis 3.12 arm64
# bottle: it crashes (std::bad_alloc, while writing output) on ANY
# Unicode-mode installer, even a trivial two-line one — confirmed by hand,
# unrelated to this project's own .nsi script. Debian's `nsis` package does
# not share that bug, so the actual compile step runs here instead.
#
# Everything else (the Go/Wails binaries themselves, wails_tools.nsh's
# version-string templating) still happens natively on the host — see the
# Makefile's _build_win_installer target — this image only ever runs
# `makensis` against already-built files handed to it via a bind mount, so
# it needs nothing beyond the compiler itself.
# =============================================================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends nsis \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
