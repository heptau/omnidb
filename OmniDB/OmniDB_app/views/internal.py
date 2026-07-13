import json

from django.conf import settings
from django.http import JsonResponse, HttpResponseForbidden
from django.db.models import Q
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt

from OmniDB_app.models.main import Connection
from OmniDB_app.views.memory_objects import get_client_object
from OmniDB_app.views.polling import queue_response

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
