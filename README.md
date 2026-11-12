# KubeScope — offline demo

KubeScope is an early visual concept for understanding Kubernetes clusters: a cluster overview, a relationship map, workload lists, node details, events, and a guided command preview.

**This development branch distributes only a static demo.** Nothing in the demo connects to Kubernetes or executes commands. All context names, workloads, command output and events are sample data.

## Try it

Download **KubeScope-v1.0.1-OFFLINE-DEMO.zip** from the v1.0.1 GitHub release. Unzip it, then open **index.html** in your browser. There is no installation, server, Python runtime, kubectl, Docker, account or internet requirement.

The UI has an in-page light/dark switch. The choice is not stored in the browser. The only activity is rendering the example interface.

## Why we separated the demo

Earlier KubeScope development builds contained a local server with live Kubernetes inspection capabilities. That is not appropriate for a no-impact product preview. The demo is therefore a **separate file** with all resources embedded and the browser configured to deny network connections.

The historical v1.0.1 source tag predates this change and should not be used for demo testing. Use the explicitly named OFFLINE-DEMO download instead. The `dev` branch now contains only demo documentation, the build script and its release workflow, not the live backend.

The `main` branch is kept documentation-focused.

## What this does not do

It does not inspect the host, read kubeconfig or credentials, access Kubernetes, read local files, save preferences, open network sockets, or change anything on a cluster. The command preview is illustrative only.

This is an evaluation preview, not a deployed Kubernetes tool.
