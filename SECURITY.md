# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 3.2.x   | :white_check_mark: |
| 3.1.x   | :x:                |
| < 3.1   | :x:                |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report security issues by email to:

**security@omnidb.net**

Or via `.well-known/security.txt`:
[https://www.omnidb.net/.well-known/security.txt](https://www.omnidb.net/.well-known/security.txt)

### What to include

- Description of the vulnerability and potential impact
- Steps to reproduce (proof of concept if available)
- Affected version(s)
- Any suggested mitigations

### Response timeline

| Step | Target time |
|------|-------------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 7 days |
| Fix or mitigation | Within 30 days (critical: 14 days) |
| Public disclosure | After fix is released |

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We will credit reporters in the release notes unless you prefer to remain anonymous.

## Scope

The following are **in scope**:

- OmniDB web interface (XSS, CSRF, authentication bypass)
- Backend API endpoints (injection, IDOR, privilege escalation)
- Session handling and credential storage
- SSH tunnel implementation
- Plugin system

The following are **out of scope**:

- Vulnerabilities in the underlying database engines (PostgreSQL, MySQL, etc.)
- Issues requiring physical access to the machine
- Social engineering attacks
- Denial-of-service against self-hosted instances

## Security-relevant configuration

When self-hosting OmniDB server:

- Run behind a reverse proxy (nginx/Caddy) with TLS
- Bind to `localhost` only unless access from other hosts is needed
- Use a strong master password and enable LDAP/SSO where possible
- Keep OmniDB updated to the latest supported release
