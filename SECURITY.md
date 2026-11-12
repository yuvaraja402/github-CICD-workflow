# KubeScope demo security

The downloadable OFFLINE-DEMO HTML contains embedded fictional data, styles and JavaScript. There is no server, executable backend, Kubernetes client, request API or installer in the release archive.

Browser restrictions: `default-src 'none'` and `connect-src 'none'`; no external JavaScript, CSS, fonts, images or network calls.

The demo does not read kubeconfig, access local files, call kubectl, use network APIs, write localStorage, ask for browser permissions, or persist the theme. Command output is simulated.

The Git tag `v1.0.1` references an archival live-capable version. Use only the named OFFLINE-DEMO archive for an isolated preview.
