# Working on KubeScope

Development work goes on `dev`. Please don't target `main` with experimental releases.

Run `python3 -m unittest discover -s tests -v` before opening a pull request. If you change UI behavior, test it in demo mode and check narrow screens. The app deliberately avoids frontend packages, hosted fonts, or libraries that add weight without solving a user problem.

Treat Kubernetes credentials and command execution carefully. Never add a generic shell endpoint or a raw kubectl execution box without a security design and an explicit review. Don't add `exec`, write commands, or access to Secrets to the default command allowlist.

Before changing navigation, make sure a developer can still answer these questions quickly: Which context am I on? What namespaces are here? What's unhealthy? How do I inspect it?
