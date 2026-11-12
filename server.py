#!/usr/bin/env python3
"""KubeScope: local, dependency-free Kubernetes developer workbench.

Runs kubectl with an argument array, never a shell. The command endpoint is a
fixed read-only allowlist. Start bound to the loopback interface only.
"""
from __future__ import annotations
import argparse
import concurrent.futures
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
SAFE_NAME = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9.\-]*[a-zA-Z0-9])?$")
RESOURCE_KIND = {
    'pod': 'pod', 'deployment': 'deployment', 'statefulset': 'statefulset',
    'daemonset': 'daemonset', 'service': 'service', 'ingress': 'ingress',
    'job': 'job', 'cronjob': 'cronjob', 'pvc': 'pvc', 'node': 'node',
}
COLLECTIONS = {
    'nodes': ['get', 'nodes', '-o', 'json'],
    'namespaces': ['get', 'namespaces', '-o', 'json'],
    'workloads': ['get', 'deployments,statefulsets,daemonsets', '-A', '-o', 'json'],
    'pods': ['get', 'pods', '-A', '-o', 'json'],
    'services': ['get', 'services', '-A', '-o', 'json'],
    'ingresses': ['get', 'ingresses', '-A', '-o', 'json'],
    'jobs': ['get', 'jobs,cronjobs', '-A', '-o', 'json'],
    'pvcs': ['get', 'persistentvolumeclaims', '-A', '-o', 'json'],
    'events': ['get', 'events', '-A', '--field-selector=type=Warning', '-o', 'json'],
    'version': ['get', '--raw=/version'],
}
KINDS = {
    'Deployment': 'deployments', 'StatefulSet': 'statefulsets',
    'DaemonSet': 'daemonsets', 'Pod': 'pods', 'Service': 'services',
    'Ingress': 'ingresses', 'Job': 'jobs', 'CronJob': 'cronjobs',
    'PersistentVolumeClaim': 'pvcs',
}


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def run_kubectl(args, context=None, timeout=15):
    cmd = ['kubectl']
    if context:
        cmd += ['--context', context]
    cmd += args
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                              env={**os.environ, 'LC_ALL': 'C'}, check=False)
    except FileNotFoundError:
        return {'ok': False, 'output': 'kubectl not found. Install kubectl and verify it is on your PATH.', 'code': 127}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'output': f'kubectl timed out after {timeout} seconds.', 'code': 124}
    return {'ok': proc.returncode == 0,
            'output': (proc.stdout or proc.stderr or '').strip()[:3_000_000],
            'code': proc.returncode}


def config_info():
    res = run_kubectl(['config', 'view', '-o', 'json'], timeout=8)
    if not res['ok']:
        return {'current': '', 'contexts': [], 'context_lookup': {}, 'clusters': {}, 'error': res['output']}
    try:
        cfg = json.loads(res['output'])
    except (ValueError, TypeError):
        return {'current': '', 'contexts': [], 'context_lookup': {}, 'clusters': {}, 'error': 'Could not read kubeconfig.'}
    lookup = {x.get('name'): x.get('context', {}) for x in cfg.get('contexts', []) if x.get('name')}
    clusters = {x.get('name'): x.get('cluster', {}) for x in cfg.get('clusters', []) if x.get('name')}
    return {'current': cfg.get('current-context', ''), 'contexts': list(lookup),
            'context_lookup': lookup, 'clusters': clusters, 'error': ''}


def valid_context(requested, config):
    chosen = requested or config['current']
    if chosen not in config['contexts']:
        raise ValueError('Unknown Kubernetes context. Select a context from your kubeconfig.')
    return chosen


def safe_name(value, title='resource name'):
    if not isinstance(value, str) or len(value) > 253 or not SAFE_NAME.fullmatch(value):
        raise ValueError(f'Invalid {title}.')
    return value


def build_command(body):
    """Construct only previously reviewed, non-mutating kubectl subcommands."""
    action = body.get('action')
    namespace = body.get('namespace', '')
    if namespace and namespace != '*':
        safe_name(namespace, 'namespace')
    kind = body.get('kind', '')
    name = body.get('name', '')
    if action in ('describe', 'yaml', 'get', 'rollout', 'logs'):
        if kind not in RESOURCE_KIND:
            raise ValueError('Select a supported resource type.')
        safe_name(name)
        if kind != 'node':
            if not namespace or namespace == '*':
                raise ValueError('Choose a specific namespace for this action.')
    ns_args = ['-n', namespace] if namespace and namespace != '*' else ['-A']
    if action == 'describe':
        return ['describe', RESOURCE_KIND[kind], name] + ([] if kind == 'node' else ns_args)
    if action == 'yaml':
        return ['get', f'{RESOURCE_KIND[kind]}/{name}'] + ([] if kind == 'node' else ns_args) + ['-o', 'yaml']
    if action == 'get':
        return ['get', f'{RESOURCE_KIND[kind]}/{name}'] + ([] if kind == 'node' else ns_args) + ['-o', 'wide']
    if action == 'logs':
        if kind != 'pod':
            raise ValueError('Logs are available for pods only.')
        return ['logs', f'pod/{name}', '-n', namespace, '--tail=100', '--all-containers=true', '--prefix=true']
    if action == 'rollout':
        if kind not in ('deployment', 'statefulset', 'daemonset'):
            raise ValueError('Rollout status is available for workload controllers only.')
        return ['rollout', 'status', f'{kind}/{name}', '-n', namespace, '--timeout=6s']
    if action == 'top_pods':
        return ['top', 'pods'] + ns_args
    if action == 'top_nodes':
        return ['top', 'nodes']
    if action == 'events':
        return ['get', 'events'] + ns_args + ['--sort-by=.lastTimestamp']
    if action == 'cluster_info':
        return ['cluster-info']
    raise ValueError('This command is not allowed. KubeScope only runs read-only inspection commands.')


def parse_list(raw):
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data.get('items', []) if isinstance(data.get('items'), list) else []
    except (ValueError, TypeError):
        pass
    return []


def normalize_resource(item):
    md = item.get('metadata') or {}
    kind = item.get('kind', '')
    spec = item.get('spec') or {}
    status = item.get('status') or {}
    name = md.get('name', '')
    ns = md.get('namespace', '')
    o = {'id': f'{kind}:{ns}:{name}', 'kind': kind, 'name': name,
         'namespace': ns, 'created': md.get('creationTimestamp', ''),
         'labels': md.get('labels') or {}, 'status': 'Unknown', 'detail': '',
         'images': [], 'owner': '', 'node': ''}
    owners = md.get('ownerReferences') or []
    if owners:
        o['owner'] = {'kind': owners[0].get('kind', ''), 'name': owners[0].get('name', '')}
    if kind == 'Pod':
        conds = (status.get('containerStatuses') or [])
        ready = sum(bool(x.get('ready')) for x in conds)
        total = len(spec.get('containers') or [])
        phase = status.get('phase') or 'Pending'
        waiting = [c.get('state', {}).get('waiting', {}).get('reason') for c in conds]
        failure = next((x for x in waiting if x in ('CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerConfigError')), None)
        o.update(status=('Error' if failure else ('Healthy' if phase == 'Running' and ready == total and total else phase)),
                 detail=f'{ready}/{total} containers ready', ready=ready, desired=total,
                 restarts=sum(int(x.get('restartCount', 0) or 0) for x in conds),
                 node=spec.get('nodeName', ''), phase=phase,
                 images=[x.get('image', '') for x in spec.get('containers', [])])
    elif kind in ('Deployment', 'StatefulSet', 'DaemonSet'):
        desired = (status.get('desiredNumberScheduled', 0) if kind == 'DaemonSet' else spec.get('replicas', 1))
        ready = (status.get('numberReady', 0) if kind == 'DaemonSet' else status.get('readyReplicas', 0))
        tpl = spec.get('template') or {}
        o.update(desired=desired, ready=ready, status='Healthy' if desired == ready else 'Degraded',
                 detail=f'{ready}/{desired} ready', selector=(spec.get('selector') or {}).get('matchLabels') or {},
                 images=[x.get('image', '') for x in (tpl.get('spec') or {}).get('containers', [])])
    elif kind == 'Service':
        o.update(status='Active', detail=spec.get('type', 'ClusterIP'),
                 selector=spec.get('selector') or {}, clusterIP=spec.get('clusterIP', ''),
                 ports=[f"{p.get('port', '')}/{p.get('protocol', 'TCP')}" for p in spec.get('ports', [])])
    elif kind == 'Ingress':
        o.update(status='Active', detail=', '.join(x.get('host') or '*' for x in spec.get('rules', [])) or 'No host')
    elif kind == 'PersistentVolumeClaim':
        phase = status.get('phase', 'Pending')
        o.update(status='Healthy' if phase == 'Bound' else phase, detail=f"{phase} · {spec.get('storageClassName', 'default')}")
    elif kind in ('Job', 'CronJob'):
        if kind == 'CronJob':
            o.update(status='Active', detail='Suspended' if spec.get('suspend') else 'Scheduled')
        else:
            ok = status.get('succeeded', 0)
            o.update(status='Healthy' if ok else ('Error' if status.get('failed') else 'Pending'),
                     detail=f'{ok} completed')
    return o


def normalize_node(n):
    md, spec, status = n.get('metadata') or {}, n.get('spec') or {}, n.get('status') or {}
    labels = md.get('labels') or {}
    info = status.get('nodeInfo') or {}
    cond = next((x for x in status.get('conditions', []) if x.get('type') == 'Ready'), {})
    roles = [x.split('node-role.kubernetes.io/', 1)[1] for x in labels if x.startswith('node-role.kubernetes.io/')]
    return {'id': f"Node::{md.get('name', '')}", 'kind': 'Node', 'name': md.get('name', ''),
            'namespace': '', 'status': 'Healthy' if cond.get('status') == 'True' else 'NotReady',
            'role': ', '.join(roles) or 'worker', 'version': info.get('kubeletVersion', ''),
            'os': info.get('osImage', ''), 'architecture': info.get('architecture', ''),
            'runtime': info.get('containerRuntimeVersion', ''), 'labels': labels,
            'providerID': spec.get('providerID', ''), 'instanceType': labels.get('node.kubernetes.io/instance-type', ''),
            'capacity': status.get('capacity') or {}, 'allocatable': status.get('allocatable') or {},
            'unschedulable': spec.get('unschedulable', False),
            'created': md.get('creationTimestamp', ''), 'detail': info.get('kubeletVersion', '')}


def infer_provider(nodes):
    s = ' '.join(n.get('providerID', '').lower() + ' ' + n.get('name', '').lower() for n in nodes)
    if 'aws://' in s or 'ec2.' in s or 'eks' in s: return 'AWS / EKS'
    if 'azure://' in s or 'aks-' in s: return 'Azure / AKS'
    if 'gce://' in s or 'gke-' in s: return 'Google Cloud / GKE'
    if 'kind-' in s: return 'Kind (local)'
    if 'minikube' in s: return 'Minikube (local)'
    if 'k3s' in s: return 'K3s'
    return 'Unknown / self-managed'


def compute_health(resources, nodes, ns_count):
    controllers = [x for key in ('deployments', 'statefulsets', 'daemonsets') for x in resources[key]]
    pods = resources['pods']
    failing = [x for x in controllers + pods if x['status'] not in ('Healthy', 'Active', 'Succeeded', 'Completed')]
    return {'nodes': len(nodes), 'readyNodes': sum(x['status'] == 'Healthy' for x in nodes),
            'namespaces': ns_count, 'workloads': len(controllers),
            'readyWorkloads': sum(x['status'] == 'Healthy' for x in controllers),
            'pods': len(pods), 'readyPods': sum(x['status'] == 'Healthy' for x in pods),
            'issues': len(failing)}


def snapshot(context=None):
    cfg = config_info()
    ctx = valid_context(context, cfg)
    info = cfg['context_lookup'][ctx]
    cluster = info.get('cluster', '')
    cdata = cfg['clusters'].get(cluster, {})
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = dict(zip(COLLECTIONS, pool.map(lambda kv: run_kubectl(kv[1], ctx), COLLECTIONS.items())))
    records = {}
    for key in COLLECTIONS:
        r = results[key]
        if not r['ok']:
            errors.append({'source': key, 'message': r['output'][:320]})
        records[key] = parse_list(r['output']) if r['ok'] else []
    namespaces = sorted([{'name': n.get('metadata', {}).get('name', ''),
                          'status': n.get('status', {}).get('phase', 'Unknown')}
                         for n in records['namespaces']], key=lambda x: x['name'])
    nodes = sorted([normalize_node(n) for n in records['nodes']], key=lambda x: x['name'])
    resources = {k: [] for k in KINDS.values()}
    for group in ('workloads', 'pods', 'services', 'ingresses', 'jobs', 'pvcs'):
        for item in records[group]:
            kind = item.get('kind', '')
            if kind in KINDS:
                resources[KINDS[kind]].append(normalize_resource(item))
    for key in resources: resources[key].sort(key=lambda x: (x['namespace'], x['name']))
    events = []
    for item in records['events']:
        md = item.get('metadata') or {}
        obj = item.get('regarding') or item.get('involvedObject') or {}
        events.append({'name': md.get('name', ''), 'namespace': md.get('namespace', ''),
                       'reason': item.get('reason', 'Warning'), 'message': item.get('message') or item.get('note', ''),
                       'count': item.get('count', 1), 'kind': obj.get('kind', ''),
                       'object': obj.get('name', ''),
                       'when': item.get('lastTimestamp') or item.get('eventTime') or md.get('creationTimestamp', '')})
    events.sort(key=lambda e: e['when'], reverse=True)
    ver = {}
    if results['version']['ok']:
        try: ver = json.loads(results['version']['output'])
        except ValueError: pass
    return {'mode': 'live', 'collectedAt': now(), 'contexts': cfg['contexts'],
            'identity': {'context': ctx, 'cluster': cluster, 'user': info.get('user', ''),
                         'defaultNamespace': info.get('namespace', 'default'),
                         'server': cdata.get('server', ''),
                         'provider': infer_provider(nodes),
                         'kubernetesVersion': ver.get('gitVersion') or ('v' + ver.get('major','') + '.' + ver.get('minor','') if ver.get('major') else 'Unknown')},
            'namespaces': namespaces, 'nodes': nodes, 'resources': resources,
            'events': events[:100], 'health': compute_health(resources, nodes, len(namespaces)), 'errors': errors}


def demo_snapshot(context=None):
    contexts = ['gke-acme-platform-prod', 'kind-local-playground', 'aks-acme-stage']
    context = context or contexts[0]
    if context not in contexts:
        raise ValueError('Unknown demo context')
    clusters = {'gke-acme-platform-prod': ('acme-platform-prod', 'Google Cloud / GKE', 'https://34.111.22.10:443'),
                'kind-local-playground': ('kind-local', 'Kind (local)', 'https://127.0.0.1:6443'),
                'aks-acme-stage': ('acme-stage', 'Azure / AKS', 'https://10.21.0.5:443')}
    cluster, provider, server = clusters[context]
    namespaces = [{'name': n, 'status': 'Active'} for n in ['default', 'payments', 'storefront', 'platform', 'kube-system', 'observability']]
    nodes = []
    for i in range(1, 5):
        nodes.append({'id': f'Node::worker-{i:02}', 'kind': 'Node', 'name': f'worker-{i:02}',
                      'namespace': '', 'status': 'NotReady' if i == 4 else 'Healthy',
                      'role': 'worker', 'version': 'v1.32.4', 'os': 'Container-Optimized OS',
                      'architecture': 'amd64', 'runtime': 'containerd://2.0.2',
                      'labels': {'kubernetes.io/arch': 'amd64', 'topology.kubernetes.io/zone': f'us-central1-{chr(96+i)}'},
                      'providerID': 'gce://acme/us-central1-a/worker-' + str(i),
                      'instanceType': 'e2-standard-4', 'capacity': {'cpu': '4', 'memory': '16268432Ki'},
                      'allocatable': {'cpu': '3920m', 'memory': '14000000Ki'},
                      'unschedulable': i == 4, 'detail': 'v1.32.4', 'created': '2026-10-04T09:11:00Z'})
    specs = [('payments', 'payment-api', 3, 2), ('payments', 'fraud-check', 2, 2),
             ('storefront', 'frontend', 4, 4), ('storefront', 'catalog-api', 3, 3),
             ('storefront', 'checkout', 2, 2), ('platform', 'auth-service', 3, 3),
             ('platform', 'notification-worker', 2, 1),
             ('observability', 'metrics-gateway', 1, 1), ('kube-system', 'coredns', 2, 2)]
    resources = {k: [] for k in KINDS.values()}
    for ns, name, desired, ready in specs:
        labels = {'app': name, 'team': ns}
        resources['deployments'].append({'id': f'Deployment:{ns}:{name}', 'kind': 'Deployment',
          'name': name, 'namespace': ns, 'created': '2026-10-29T10:00:00Z', 'labels': labels,
          'status': 'Healthy' if desired == ready else 'Degraded', 'detail': f'{ready}/{desired} ready',
          'desired': desired, 'ready': ready, 'selector': {'app': name},
          'images': [f'registry.acme.dev/{name}:2.14.7'], 'owner': '', 'node': ''})
        resources['services'].append({'id': f'Service:{ns}:{name}', 'kind': 'Service',
          'name': name, 'namespace': ns, 'created': '2026-10-29T10:00:00Z',
          'labels': labels, 'status': 'Active', 'detail': 'ClusterIP',
          'clusterIP': f'10.96.{len(resources["services"])+1}.20', 'selector': {'app': name},
          'ports': ['80/TCP'], 'images': [], 'owner': '', 'node': ''})
        for j in range(desired):
            ok = j < ready
            pname = f'{name}-7d9c8b-{j+1:05d}'
            resources['pods'].append({'id': f'Pod:{ns}:{pname}', 'kind': 'Pod', 'name': pname,
              'namespace': ns, 'labels': labels, 'created': '2026-11-10T12:10:00Z',
              'status': 'Healthy' if ok else ('Error' if name == 'payment-api' else 'Pending'),
              'detail': '1/1 containers ready' if ok else '0/1 containers ready',
              'ready': 1 if ok else 0, 'desired': 1, 'restarts': 0 if ok else 7,
              'phase': 'Running' if ok else 'Pending', 'node': f'worker-{j % 3 + 1:02}',
              'owner': {'kind': 'ReplicaSet', 'name': f'{name}-7d9c8b'},
              'images': [f'registry.acme.dev/{name}:2.14.7']})
    resources['daemonsets'] = [{'id': 'DaemonSet:kube-system:fluent-bit', 'kind': 'DaemonSet',
      'name': 'fluent-bit', 'namespace': 'kube-system', 'created': '2026-10-04T12:00:00Z',
      'labels': {'app': 'fluent-bit'}, 'status': 'Healthy', 'detail': '3/3 ready',
      'desired': 3, 'ready': 3, 'selector': {'app': 'fluent-bit'},
      'images': ['fluent/fluent-bit:3.2'], 'owner': '', 'node': ''}]
    resources['statefulsets'] = [{'id': 'StatefulSet:platform:redis', 'kind': 'StatefulSet',
      'name': 'redis', 'namespace': 'platform', 'created': '2026-10-04T12:00:00Z',
      'labels': {'app': 'redis'}, 'status': 'Healthy', 'detail': '2/2 ready',
      'desired': 2, 'ready': 2, 'selector': {'app': 'redis'}, 'images': ['redis:7.4'], 'owner': '', 'node': ''}]
    resources['ingresses'] = [{'id': 'Ingress:storefront:storefront-public', 'kind': 'Ingress',
      'name': 'storefront-public', 'namespace': 'storefront', 'created': '2026-10-04T12:00:00Z',
      'labels': {}, 'status': 'Active', 'detail': 'shop.example.test', 'images': [], 'owner': '', 'node': ''}]
    events = [
      {'name': 'evt-1', 'namespace': 'payments', 'reason': 'BackOff', 'message': 'Back-off restarting failed container payment-api', 'count': 8, 'kind': 'Pod', 'object': 'payment-api-7d9c8b-00003', 'when': '2026-11-12T14:54:00Z'},
      {'name': 'evt-2', 'namespace': 'platform', 'reason': 'FailedScheduling', 'message': '0/4 nodes are available: 1 node(s) were unschedulable', 'count': 3, 'kind': 'Pod', 'object': 'notification-worker-7d9c8b-00002', 'when': '2026-11-12T14:45:00Z'},
      {'name': 'evt-3', 'namespace': 'kube-system', 'reason': 'NodeNotReady', 'message': 'Node worker-04 status is now: NodeNotReady', 'count': 1, 'kind': 'Node', 'object': 'worker-04', 'when': '2026-11-12T14:32:00Z'},
    ]
    return {'mode': 'demo', 'collectedAt': now(), 'contexts': contexts,
      'identity': {'context': context, 'cluster': cluster, 'user': 'developer@acme',
                   'defaultNamespace': 'default', 'server': server, 'provider': provider,
                   'kubernetesVersion': 'v1.32.4'},
      'namespaces': namespaces, 'nodes': nodes, 'resources': resources,
      'events': events, 'health': compute_health(resources, nodes, len(namespaces)), 'errors': []}


class App(BaseHTTPRequestHandler):
    server_version = 'KubeScope/0.1'

    def log_message(self, fmt, *args):
        # Do not log raw command results or kube credentials.
        print('[kubescope] ' + fmt % args, file=sys.stderr)

    def common_headers(self, code, content_type='application/json; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
        self.end_headers()

    def json_response(self, code, data):
        output = json.dumps(data, separators=(',', ':')).encode()
        self.common_headers(code)
        self.wfile.write(output)

    def trusted_host(self):
        host = (self.headers.get('Host') or '').split(':', 1)[0].lower()
        return host in ('127.0.0.1', 'localhost', '[::1]')

    def do_GET(self):
        if not self.trusted_host():
            return self.json_response(403, {'error': 'Only localhost requests are accepted.'})
        parsed = urlparse(self.path)
        if parsed.path == '/api/health':
            return self.json_response(200, {'demo': self.server.demo, 'kubectl': shutil.which('kubectl') is not None, 'time': now()})
        if parsed.path == '/api/snapshot':
            try:
                context = parse_qs(parsed.query).get('context', [None])[0]
                data = demo_snapshot(context) if self.server.demo else snapshot(context)
                return self.json_response(200, data)
            except ValueError as e:
                return self.json_response(400, {'error': str(e)})
            except Exception:
                return self.json_response(503, {'error': 'Unable to inspect the cluster. Check kubectl access and the server logs.'})
        static = {'/': ('index.html', 'text/html; charset=utf-8'),
                  '/index.html': ('index.html', 'text/html; charset=utf-8'),
                  '/app.css': ('app.css', 'text/css; charset=utf-8'),
                  '/app.js': ('app.js', 'text/javascript; charset=utf-8')}
        if parsed.path in static:
            f, typ = static[parsed.path]
            p = ROOT / 'static' / f
            data = p.read_bytes()
            self.common_headers(200, typ)
            return self.wfile.write(data)
        self.json_response(404, {'error': 'Not found'})

    def do_POST(self):
        if not self.trusted_host():
            return self.json_response(403, {'error': 'Only localhost requests are accepted.'})
        if urlparse(self.path).path != '/api/command':
            return self.json_response(404, {'error': 'Not found'})
        # Block cross-origin command execution from untrusted websites.
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}',
                                     f'http://localhost:{self.server.server_port}'):
            return self.json_response(403, {'error': 'Cross-origin commands are blocked.'})
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            return self.json_response(415, {'error': 'Expected application/json'})
        try:
            length = int(self.headers.get('Content-Length') or '0')
            if not 0 < length <= 8192:
                raise ValueError('Invalid request size.')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('Expected command object.')
            args = build_command(body)
            if self.server.demo:
                context = body.get('context') or 'gke-acme-platform-prod'
                if context not in demo_snapshot()['contexts']:
                    raise ValueError('Unknown demo context')
                cmd = 'kubectl --context ' + context + ' ' + ' '.join(args)
                out = ('DEMO MODE — no cluster command was executed.\n\n$ ' + cmd +
                       '\n\nThis is an interactive preview. Restart without --demo to run this read-only command against your kubeconfig.')
                return self.json_response(200, {'ok': True, 'code': 0, 'command': cmd, 'output': out, 'demo': True})
            cfg = config_info()
            context = valid_context(body.get('context'), cfg)
            result = run_kubectl(args, context, timeout=18)
            return self.json_response(200, {**result, 'command': 'kubectl --context ' + context + ' ' + ' '.join(args)})
        except (ValueError, json.JSONDecodeError) as e:
            return self.json_response(400, {'error': str(e)})
        except Exception:
            return self.json_response(503, {'error': 'Unable to execute the inspection command.'})


def main():
    p = argparse.ArgumentParser(description='KubeScope — local Kubernetes visual workbench')
    p.add_argument('--demo', action='store_true', help='Use safe sample data; no kubectl required')
    p.add_argument('--port', type=int, default=8765)
    p.add_argument('--host', default='127.0.0.1', help='Loopback only (127.0.0.1 or localhost)')
    args = p.parse_args()
    if args.host not in ('127.0.0.1', 'localhost', '::1'):
        p.error('Remote binding is disabled to prevent exposing local kubeconfig privileges. Use localhost.')
    httpd = ThreadingHTTPServer((args.host, args.port), App)
    httpd.demo = args.demo
    print(f'KubeScope running at http://{args.host}:{args.port}/' + ('  [DEMO]' if args.demo else '  [LIVE]'), flush=True)
    print('Read-only commands only. Press Ctrl+C to stop.', flush=True)
    try: httpd.serve_forever()
    except KeyboardInterrupt: pass
    finally: httpd.server_close()


if __name__ == '__main__':
    main()
