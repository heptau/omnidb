from django.contrib.auth.models import User


class TrustedUserMiddleware:
	"""
	Fáze 7 of the Django-to-Go backend migration: Go now owns login/session
	natively (see go-server/native_login.go), but the handful of routes
	still served directly by Django (users.py, monitor_dashboard.py,
	workspace.py's own page render, static files, ...) still need
	request.user — and, transitively, request.session['omnidb_session'],
	still built by check_session()/workspace.index() exactly as before —
	to work.

	Go's own reverse proxy (see go-server/main.go's Director wrapper) adds
	an X-Omnidb-Trusted-User-Id header to every request it forwards here,
	derived from ITS OWN native session cookie — never from anything
	Django itself authenticated anymore. This middleware trusts that header
	completely, but only from loopback: the only way Django is ever reached
	in this architecture is through Go's own proxy on 127.0.0.1, so a
	request arriving any other way means something is badly misconfigured,
	not a real multi-tenant scenario this needs to defend against.

	Also disables Django's own CSRF check for these requests
	(_dont_enforce_csrf_checks) — Go's own reverse proxy already validates
	CSRF via a double-submit cookie check (see go-server/native_session.go)
	before ever forwarding a state-changing request here, and Django's own
	CsrfViewMiddleware has no way to validate a token it didn't itself
	generate/mask.
	"""

	def __init__(self, get_response):
		self.get_response = get_response

	def __call__(self, request):
		user_id = request.META.get('HTTP_X_OMNIDB_TRUSTED_USER_ID')
		if user_id and request.META.get('REMOTE_ADDR') in ('127.0.0.1', '::1'):
			try:
				request.user = User.objects.get(id=int(user_id))
				request._dont_enforce_csrf_checks = True
			except (User.DoesNotExist, ValueError):
				pass
		return self.get_response(request)
