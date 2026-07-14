import json

from django.conf import settings
from django.http import JsonResponse, HttpResponseForbidden
from django.db.models import Q
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt

from OmniDB_app.models.main import Connection, UserDetails
from OmniDB_app.views.memory_objects import get_client_object, clear_client_object
from OmniDB_app.views.polling import queue_response
from OmniDB_app.include.Session import Session

# Loopback-only bridge used by the Go backend (see /go-server) to resolve
# session identity without reimplementing Django's session store/ORM. As
# vertical slices of the API move to Go (see the migration plan), the
# Go-side handler for a still-unmigrated route forwards the browser's own
# session cookie here to find out who's asking, instead of proxying the
# whole request to Django.
def _is_loopback(request):
	return request.META.get('REMOTE_ADDR') in ('127.0.0.1', '::1')

def whoami(request):
	if not _is_loopback(request):
		return HttpResponseForbidden()

	if not request.user.is_authenticated:
		return JsonResponse({'authenticated': False})

	v_session = request.session.get('omnidb_session')

	return JsonResponse({
		'authenticated': True,
		'user_id': request.user.id,
		'username': request.user.username,
		'super_user': request.user.is_superuser,
		'csv_encoding': v_session.v_csv_encoding if v_session else None,
		'csv_delimiter': v_session.v_csv_delimiter if v_session else None,
	})

# Returns the raw connection row for a migrated Go route to open its own
# native driver connection with (see go-server/sqlite.go), instead of
# reusing Django's in-memory OmniDatabase driver instances. Deliberately
# does the same ownership check Session.RefreshDatabaseList() does (owner or
# public) so a caller can't read someone else's saved connection just by
# guessing an id.
def connection_info(request):
	if not _is_loopback(request):
		return HttpResponseForbidden()

	if not request.user.is_authenticated:
		return JsonResponse({'found': False}, status=401)

	conn_id = request.GET.get('id')
	if not conn_id:
		return JsonResponse({'found': False}, status=400)

	try:
		conn = Connection.objects.select_related('technology').get(
			Q(user=request.user) | Q(public=True),
			id=conn_id,
		)
	except Connection.DoesNotExist:
		return JsonResponse({'found': False}, status=404)

	return JsonResponse({
		'found': True,
		'technology': conn.technology.name,
		'server': conn.server,
		'port': conn.port,
		'database': conn.database,
		'username': conn.username,
		'password': conn.password,
		'alias': conn.alias,
		'public': conn.public,
	})

# Reveals the absolute path of Django's own SQLite app database (the one
# holding Connection/Group/SnippetFolder/SnippetFile/etc — see
# OmniDB_app/models/main.py), so a migrated Go route can open it directly
# with database/sql instead of reimplementing Django's ORM/session store.
# This path is NOT a fixed constant — HOME_DIR varies between dev mode, the
# desktop app (~/.omnidb/omnidb-app), and server mode (~/.omnidb/omnidb-server),
# see omnidb-server.py — so it must be asked for at runtime, not guessed.
def appdb_path(request):
	if not _is_loopback(request):
		return HttpResponseForbidden()

	return JsonResponse({'path': settings.DATABASES['default']['NAME']})

# Reveals settings.TEMP_DIR (OmniDB_app/static/temp under Django's own
# install) and settings.PATH (the URL prefix Django serves its own static
# files under — '' by default, see custom_settings.py) so a migrated Go
# route can write an export file where Django's existing static-file
# serving already picks it up, without Go needing to run its own static
# file server or guess Django's directory layout.
def temp_dir(request):
	if not _is_loopback(request):
		return HttpResponseForbidden()

	return JsonResponse({'temp_dir': settings.TEMP_DIR, 'path': settings.PATH})

# Lets a migrated Go route (see go-server/longpolling.go) deliver a result
# through Django's own long-polling queue instead of maintaining a parallel
# delivery mechanism. This matters for more than just code reuse: Django's
# /long_polling/ view uses a per-client threading.Lock as a wake-up signal
# that only ever gets released by queue_response() — a Go-side proxy that
# forwarded to /long_polling/ and gave up after a timeout would leave that
# lock (and the Django thread blocked on it) stuck forever, since nothing
# else would ever call queue_response for a client whose queries all run in
# Go. Routing through the real queue_response() sidesteps that entirely.
# csrf_exempt is safe here because _is_loopback already restricts this to
# calls from this machine's own Go process, not browsers.
@csrf_exempt
def queue_response_internal(request):
	if not _is_loopback(request):
		return HttpResponseForbidden()

	if not request.session.session_key or not request.user.is_authenticated:
		return JsonResponse({'queued': False}, status=401)

	try:
		payload = json.loads(request.body)
	except (json.JSONDecodeError, TypeError):
		return JsonResponse({'queued': False}, status=400)

	client_object = get_client_object(request.session.session_key)
	queue_response(client_object, payload)
	return JsonResponse({'queued': True})

# Lets Go's native /workspace/ and / (check_session) page renders (see
# go-server/workspace_page.go) keep Django's own session machinery alive
# without proxying either request to Django at all — /long_polling/,
# /client_keep_alive/, and part of /create_request/ (see polling.py) are
# NOT yet ported (Fáze 8b's remaining item) and all key their in-memory
# client_object by request.session.session_key, which only exists once a
# real Django session has been saved at least once. Before Fáze 8, a
# browser always hit Django's own check_session (bootstrap) then
# workspace.index() (refresh) in sequence, which did this as a side
# effect; this endpoint collapses both of those Django-session side
# effects (get-or-create UserDetails, get-or-create the omnidb_session
# Session object, RefreshDatabaseList, wipe v_tabs_databases,
# clear_client_object) into one call Go can make on every /workspace/
# render, same as workspace.index() used to run on every request. The
# caller must relay this response's Set-Cookie (the omnidb_sessionid
# cookie, only present the first time a given browser session hits this)
# back to the real browser response — see ensureDjangoSession in
# go-server/workspace_page.go.
@csrf_exempt
def prepare_workspace_session(request):
	if not _is_loopback(request):
		return HttpResponseForbidden()
	if not request.user.is_authenticated:
		return JsonResponse({'ok': False}, status=401)

	try:
		user_details = UserDetails.objects.get(user=request.user)
	except Exception:
		user_details = UserDetails(user=request.user)
		user_details.save()

	if not request.session.get('omnidb_session'):
		request.session.save()
		v_session = Session(
			request.user.id,
			request.user.username,
			'light',
			user_details.font_size,
			request.user.is_superuser,
			request.session.session_key,
			user_details.csv_encoding,
			user_details.csv_delimiter
		)
	else:
		v_session = request.session.get('omnidb_session')
		v_session.RefreshDatabaseList()

	v_session.v_tabs_databases = dict([])
	request.session['omnidb_session'] = v_session

	clear_client_object(p_client_id=request.session.session_key)

	return JsonResponse({'ok': True})
