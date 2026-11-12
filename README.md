# KubeScope

**Find the right cluster. See what's running. Get to the problem.**

KubeScope is a local Kubernetes workbench for developers who need a clear view of their environment without building every answer from `kubectl` commands.

![KubeScope dashboard showing sample data](docs/screenshots/overview.jpg)

## What you can do

- See the current Kubernetes context, API server, nodes, namespaces and workload status.
- Explore deployments, pods, services, jobs and other common cluster resources.
- Follow workload relationships through an interactive cluster map.
- Find unhealthy workloads and Kubernetes warning events.
- Inspect resources using guided, read-only commands.

There's a built-in demo, so you can try the interface without connecting a cluster.

## Try it

The application lives on the [`dev` branch](../../tree/dev), not on `main`. To launch the demo:

```bash
git clone --branch dev https://github.com/yuvaraja402/github-CICD-workflow.git
cd github-CICD-workflow
python3 server.py --demo
```

Visit `http://127.0.0.1:8765` in your browser. For an authorized live cluster, run `python3 server.py` after configuring `kubectl`.

## Releases

- [`v1.0.0`](../../releases/tag/v1.0.0) — first development snapshot.
- [`v1.0.1`](../../releases/tag/v1.0.1) — light and dark themes, with a saved preference.

Both versions are development previews, not production-qualified releases. The app runs locally and currently uses a read-only command allowlist. It is not yet Helm-installable or a multi-user web service.

## Where the code lives

`main` is for this project overview and screenshots. Application source, tests, development workflows and detailed documentation live in [`dev`](../../tree/dev). The repository keeps its existing Git history.

Questions and contributions are welcome through GitHub issues and pull requests against `dev`.
