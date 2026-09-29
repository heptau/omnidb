package main

import (
	"net"
	"net/http"
	"strconv"
	"strings"
)

// maxRequestBodyBytes caps every request body. The largest legitimate
// payloads are an Edit Data save or a pasted script, both far below this;
// without a cap, readFormData's io.ReadAll lets any client that can reach
// the port (before authentication even runs) exhaust memory.
const maxRequestBodyBytes = 64 << 20

// hardenHTTP wraps the whole mux with protections every route needs:
//
//   - Host allowlist while bound to loopback. Binding to 127.0.0.1 doesn't
//     stop a DNS-rebinding page (evil.example resolving to 127.0.0.1) from
//     talking to this server as its *own* origin, reading responses and
//     receiving cookies scoped to that name. Real requests always address
//     this server by a loopback name, so anything else is refused. A
//     wide -H bind can't know its public names in advance and skips this.
//   - A request body size cap (see maxRequestBodyBytes).
//   - Baseline response headers: no MIME sniffing, no framing by other
//     origins (clickjacking), and no Referer leaking URLs — the desktop
//     app's first URL carries its login token.
func hardenHTTP(listenHost string, port int, next http.Handler) http.Handler {
	var allowedHosts map[string]bool
	if isLoopbackHost(listenHost) {
		p := strconv.Itoa(port)
		allowedHosts = map[string]bool{
			net.JoinHostPort("127.0.0.1", p): true,
			net.JoinHostPort("localhost", p): true,
			net.JoinHostPort("::1", p):       true,
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if allowedHosts != nil && !allowedHosts[strings.ToLower(r.Host)] {
			http.Error(w, "invalid host", http.StatusMisdirectedRequest)
			return
		}
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Content-Security-Policy", "frame-ancestors 'self'")
		h.Set("Referrer-Policy", "no-referrer")
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}
