package main

// omnidbShortVersion mirrors settings.OMNIDB_SHORT_VERSION — kept in sync
// with the top-level VERSION file by the Makefile's _sync_version target,
// same as custom_settings.py/Dockerfile/pyproject.toml. Only used for
// cosmetic display (the login page's "v3.5.0" corner label).
const omnidbShortVersion = "3.5.0"

// omnidbVersion mirrors settings.OMNIDB_VERSION (custom_settings.py:
// 'OmniDB ' + the short version) — used by workspace.html's about-dialog
// title and its v_version JS global.
const omnidbVersion = "OmniDB " + omnidbShortVersion
