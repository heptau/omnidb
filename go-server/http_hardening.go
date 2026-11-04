package main

import (
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
)

// maxRequestBodyBytes caps every request body. The largest legitimate
// payloads are an Edit Data save or a pasted script, both far below this;
// without a cap, readFormData's io.ReadAll lets any client that can reach
// the port (before authentication even runs) exhaust memory.
const maxRequestBodyBytes = 64 << 20

// allowedHostsEnv names extra Host values accepted while bound to loopback.
const allowedHostsEnv = "OMNIDB_ALLOWED_HOSTS"

// hostAllowed matches the request Host against the allowlist, both as sent
// ("name:port") and with the port stripped ("name").
func hostAllowed(allowed map[string]bool, host string) bool {
	host = strings.ToLower(host)
	if allowed[host] {
		return true
	}
	if h, _, err := net.SplitHostPort(host); err == nil {
		return allowed[h]
	}
	return false
}

// hardenHTTP wraps the whole mux with protections every route needs:
//
//   - Host allowlist while bound to loopback. Binding to 127.0.0.1 doesn't
//     stop a DNS-rebinding page (evil.example resolving to 127.0.0.1) from
//     talking to this server as its *own* origin, reading responses and
//     receiving cookies scoped to that name. Real requests always address
//     this server by a loopback name, so anything else is refused. A
//     wide -H bind can't know its public names in advance and skips this.
//     A reverse proxy that forwards its own public or upstream name as Host
//     can be accommodated by listing those names in OMNIDB_ALLOWED_HOSTS
//     (comma-separated; "name" matches any port, "name:port" only that one).
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
		for _, h := range strings.Split(os.Getenv(allowedHostsEnv), ",") {
			if h = strings.ToLower(strings.TrimSpace(h)); h != "" {
				allowedHosts[h] = true
			}
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if allowedHosts != nil && !hostAllowed(allowedHosts, r.Host) {
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
