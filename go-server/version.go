package main

// omnidbShortVersion is kept in sync with the top-level VERSION file by the
// Makefile's _sync_version target (also updates wails-app/frontend/index.html's
// loading-screen version label). Only used for cosmetic display (the login
// page's "v3.5.0" corner label).
const omnidbShortVersion = "4.2.0"

// omnidbVersion is used by workspace.html's about-dialog title and its
// v_version JS global.
const omnidbVersion = "OmniDB " + omnidbShortVersion
