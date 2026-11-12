# KubeScope v1.0.0 — security and deployment model

KubeScope is a **localhost-only development workbench**. It is not a multi-user, public, or in-cluster dashboard, and it should not be deployed via an internet-facing Ingress, proxy, or tunnel.

## Trust boundary

- The server uses the Kubernetes credentials available to the account that launches it. All Kubernetes API permissions are decided by the user's existing kubeconfig and cluster RBAC.
- The web app only binds to loopback (`127.0.0.1`, `localhost`, or `::1`), checks the HTTP Host header, and rejects command POST requests with untrusted Origin headers.
- Every command is built server-side from an explicit allowlist. The server does not offer arbitrary `kubectl` flags, shell execution, pod exec, write operations, or Secrets inspection.
- The application passes `--context` explicitly and does **not** change the global kubeconfig current-context setting.
- Data is fetched on demand and not persisted by KubeScope.

## User responsibilities

- Prefer a dedicated kubeconfig with minimum Kubernetes RBAC permissions needed for inspection.
- Don't expose this process on the public internet, put it behind an Ingress, or share a browser session on an untrusted machine.
- `kubectl describe`, pod logs, and YAML can contain sensitive application information (even though the summary dashboard does not list Secret objects). Treat command output as sensitive and avoid sharing it publicly.
- Use demo mode (`python3 server.py --demo`) for screenshots, product demonstrations, and exploration without cluster access.

## Before turning it into a shared SaaS or Helm-installed product

Add server-side OIDC authentication, per-user authorization and audit logs, encrypted identity/session management, workload isolation, rate limits, controlled Kubernetes API service-account credentials, external security review, and a deployment-safe network/security architecture. A shared service must not inherit the full permissions of the machine running its web server.
