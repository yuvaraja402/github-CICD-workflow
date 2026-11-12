# KubeScope v1.0.0 — development preview

This is the v1.0.0 development preview of KubeScope. The version identifies this release milestone; it does not mean the tool has been validated for production use.

It's a small local web app for getting oriented in a Kubernetes cluster. You can see your context, namespaces, nodes, workloads, warning events, and a map of resource relationships without remembering all the `kubectl` commands.

The overview and resource views have been redesigned for clarity. The UI uses local CSS and SVG assets rather than pulling in a big frontend framework or remote graphics.

## Included

- Local browser dashboard with demo mode.
- Read-only Kubernetes inspection through an existing `kubectl` and kubeconfig.
- Namespace, workload, node, event, and resource-map screens.
- Guided commands with output in the UI.
- Basic backend tests and development CI.

## Not included yet

No Helm installer, Windows/macOS packaged binary, shared login, managed SaaS backend, or automated remediation. This is for local evaluation, not production deployment. Real-cluster testing is still limited.

## Try it

```bash
python3 server.py --demo
```

Open http://127.0.0.1:8765. To inspect a real cluster, run `python3 server.py` after checking your kubeconfig and permissions.
