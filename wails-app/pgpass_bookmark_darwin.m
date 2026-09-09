#import "pgpass_bookmark_darwin.h"
#import <Cocoa/Cocoa.h>
#import <string.h>

static unsigned char *copyBookmarkBytes(NSData *bookmark, int *outLen) {
	NSUInteger len = [bookmark length];
	unsigned char *buf = (unsigned char *)malloc(len);
	memcpy(buf, [bookmark bytes], len);
	*outLen = (int)len;
	return buf;
}

int pgpass_pick_file_and_bookmark(char **outPath, unsigned char **outBookmark, int *outBookmarkLen,
								   int *outCancelled, char **outErr) {
	__block int ok = 0;
	__block BOOL cancelled = NO;
	__block NSString *resultPath = nil;
	__block NSData *resultBookmark = nil;
	__block NSString *resultErr = nil;

	void (^pick)(void) = ^{
		@autoreleasepool {
			NSOpenPanel *panel = [NSOpenPanel openPanel];
			panel.title = @"Select .pgpass file";
			panel.nameFieldStringValue = @".pgpass";
			panel.showsHiddenFiles = YES;
			panel.canChooseFiles = YES;
			panel.canChooseDirectories = NO;
			panel.allowsMultipleSelection = NO;
			// This runs from a background HTTP handler goroutine's
			// dispatch to the main thread, not from a menu/button click,
			// so there's no guarantee the app is already frontmost —
			// without this the panel can appear behind other windows.
			[NSApp activateIgnoringOtherApps:YES];

			if ([panel runModal] != NSModalResponseOK) {
				cancelled = YES;
				return;
			}
			NSURL *url = panel.URLs.firstObject;
			if (url == nil) {
				cancelled = YES;
				return;
			}
			NSError *error = nil;
			NSData *bookmark = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope
									  includingResourceValuesForKeys:nil
													   relativeToURL:nil
															   error:&error];
			resultPath = url.path;
			// A build running outside the App Sandbox (wails dev, or a
			// direct-download build signed without the app-sandbox
			// entitlement) cannot create a security-scoped bookmark at
			// all — and has no use for one: its access to the picked path
			// never goes away, so the path alone is enough to remember.
			// Hand back the pick with no bookmark rather than failing it
			// outright, which is what used to make this whole feature
			// unusable in a dev build.
			resultBookmark = bookmark;
			ok = 1;
		}
	};

	if ([NSThread isMainThread]) {
		pick();
	} else {
		dispatch_sync(dispatch_get_main_queue(), pick);
	}

	if (cancelled) {
		*outCancelled = 1;
		return 0;
	}
	if (!ok) {
		if (outErr) *outErr = strdup([(resultErr ?: @"unknown error") UTF8String]);
		return 0;
	}
	*outPath = strdup([resultPath UTF8String]);
	*outBookmark = copyBookmarkBytes(resultBookmark, outBookmarkLen);
	return 1;
}

int pgpass_resolve_bookmark(const unsigned char *data, int len, char **outPath,
							 unsigned char **outRefreshedBookmark, int *outRefreshedBookmarkLen,
							 char **outErr) {
	@autoreleasepool {
		NSData *bookmark = [NSData dataWithBytes:data length:(NSUInteger)len];
		BOOL stale = NO;
		NSError *error = nil;
		NSURL *url = [NSURL URLByResolvingBookmarkData:bookmark
												options:NSURLBookmarkResolutionWithSecurityScope
										  relativeToURL:nil
									bookmarkDataIsStale:&stale
												  error:&error];
		if (url == nil) {
			if (outErr) *outErr = strdup([[error localizedDescription] UTF8String]);
			return 0;
		}
		if (![url startAccessingSecurityScopedResource]) {
			if (outErr) *outErr = strdup("startAccessingSecurityScopedResource failed");
			return 0;
		}
		*outPath = strdup([[url path] UTF8String]);

		if (stale) {
			NSError *refreshError = nil;
			NSData *fresh = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope
								includingResourceValuesForKeys:nil
												 relativeToURL:nil
														 error:&refreshError];
			// A failed refresh isn't fatal — the bookmark we were handed
			// still just resolved fine above, so leave the "no refresh"
			// outputs at their zero value and let the caller keep using
			// the data it already had.
			if (fresh != nil) {
				*outRefreshedBookmark = copyBookmarkBytes(fresh, outRefreshedBookmarkLen);
			}
		}
		return 1;
	}
}

void pgpass_stop_accessing(const char *path) {
	@autoreleasepool {
		NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];
		[url stopAccessingSecurityScopedResource];
	}
}
