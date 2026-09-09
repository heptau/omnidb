#ifndef PGPASS_BOOKMARK_DARWIN_H
#define PGPASS_BOOKMARK_DARWIN_H

// Shows a native Open panel for a .pgpass file (single file, hidden files
// visible — .pgpass is a dotfile every panel hides by default) and, if the
// user picks one, immediately creates a security-scoped bookmark from the
// *exact* NSURL object the panel returned.
//
// That last part matters more than it sounds: creating the bookmark from
// any other NSURL for the same path (e.g. one built with
// [NSURL fileURLWithPath:]) produces a bookmark that still *looks* valid —
// it encodes fine, and even resolves fine — but does not actually carry a
// working sandbox grant, because the temporary access a sandboxed process
// gets from a user's Open-panel selection lives on that specific NSURL
// object returned by the panel, not on the path string it wraps. This is
// exactly the bug the first version of this feature had: it read the path
// back from wailsruntime.OpenFileDialog's plain string return value and
// rebuilt an NSURL from that to bookmark it — access worked for the rest
// of that same launch (an Open-panel selection is directly readable no
// matter how the bookmark turned out), but resolving the saved bookmark on
// the next launch never actually restored access, so every relaunch
// silently fell back to asking the user to pick the file all over again.
//
// Runs on the main thread as NSOpenPanel requires — dispatches there
// itself if called from any other thread, so callers never need to think
// about that.
//
// Returns 1 on success: *outPath is a malloc'd UTF-8 path, already
// directly readable with no extra step (Open-panel access doesn't need
// startAccessingSecurityScopedResource — only resolving a *bookmark*
// does, see pgpass_resolve_bookmark below), and
// *outBookmark/*outBookmarkLen is malloc'd bookmark data to persist for
// next launch. Both must be freed by the caller.
// Returns 0 with *outCancelled=1 if the user cancelled (no error, nothing
// else set).
// Returns 0 with a malloc'd UTF-8 *outErr (caller frees) on any real
// failure.
int pgpass_pick_file_and_bookmark(char **outPath, unsigned char **outBookmark, int *outBookmarkLen,
								   int *outCancelled, char **outErr);

// Resolves previously-saved bookmark data back to a path and starts
// accessing it as a security-scoped resource — this is what actually
// re-grants the sandbox extension on a later launch, no Open panel
// involved. On success returns 1 and writes a malloc'd UTF-8 path into
// *outPath — the caller must free it and later call
// pgpass_stop_accessing(*outPath) once done reading.
//
// If the resolved bookmark reports itself as stale, this also computes a
// refreshed bookmark from that same resolved, now access-started URL (the
// one instance that legitimately carries a working scope at this point —
// see pgpass_pick_file_and_bookmark's comment on why any other NSURL for
// the same path would not): *outRefreshedBookmark/*outRefreshedBookmarkLen
// are set (malloc'd, caller frees) only when a refresh was both needed and
// itself succeeded; otherwise both are left NULL/0 and the caller should
// just go on using the bookmark data it already had, which still resolved
// fine this time regardless of staleness.
//
// On failure (revoked, deleted, corrupt data) returns 0 and writes a
// malloc'd UTF-8 error into *outErr (caller frees).
int pgpass_resolve_bookmark(const unsigned char *data, int len, char **outPath,
							 unsigned char **outRefreshedBookmark, int *outRefreshedBookmarkLen,
							 char **outErr);

// Balances a successful pgpass_resolve_bookmark call — releases the
// security-scoped access it started for path. Every successful resolve
// must be paired with exactly one of these.
void pgpass_stop_accessing(const char *path);

#endif
