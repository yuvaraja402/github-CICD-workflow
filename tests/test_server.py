import unittest
from server import build_command, demo_snapshot, compute_health, normalize_resource, valid_context

class Commands(unittest.TestCase):
    def test_pod_logs(self):
        self.assertEqual(build_command({'action': 'logs', 'kind': 'pod', 'name': 'api-123', 'namespace': 'dev'}),
                         ['logs', 'pod/api-123', '-n', 'dev', '--tail=100', '--all-containers=true', '--prefix=true'])
    def test_cluster_scoped(self):
        self.assertEqual(build_command({'action': 'describe', 'kind': 'node', 'name': 'worker-1'}),
                         ['describe', 'node', 'worker-1'])
    def test_reject_unsafe(self):
        for bad in [
            {'action': 'delete', 'kind': 'deployment', 'name': 'api', 'namespace': 'prod'},
            {'action': 'describe', 'kind': 'secret', 'name': 'creds', 'namespace': 'prod'},
            {'action': 'describe', 'kind': 'pod', 'name': 'api;whoami', 'namespace': 'prod'},
            {'action': 'logs', 'kind': 'pod', 'name': '--help', 'namespace': 'prod'},
            {'action': 'logs', 'kind': 'pod', 'name': 'api', 'namespace': 'prod;delete'},
            {'action': 'logs', 'kind': 'deployment', 'name': 'api', 'namespace': 'prod'},
            {'action': 'yaml', 'kind': 'pod', 'name': 'api', 'namespace': '*'},
        ]:
            with self.subTest(bad=bad), self.assertRaises(ValueError): build_command(bad)
    def test_metrics(self):
        self.assertEqual(build_command({'action': 'top_pods', 'namespace': '*'}), ['top', 'pods', '-A'])
    def test_demo(self):
        d = demo_snapshot()
        self.assertEqual(d['mode'], 'demo')
        self.assertEqual(d['health']['namespaces'], 6)
        self.assertGreater(d['health']['pods'], 10)
        self.assertEqual(d['health']['nodes'], 4)
        self.assertTrue(d['events'])
        self.assertIn('payments', [x['name'] for x in d['namespaces']])
    def test_context_validation(self):
        cfg = {'contexts': ['prod'], 'current': 'prod'}
        self.assertEqual(valid_context(None, cfg), 'prod')
        with self.assertRaises(ValueError): valid_context('unknown', cfg)
    def test_no_environment_leak(self):
        resource = {'kind': 'Pod', 'metadata': {'name': 'app', 'namespace': 'dev'},
          'spec': {'containers': [{'name': 'app', 'image': 'app:v1', 'env': [{'name': 'PASSWORD', 'value': 'secret-value'}]}]},
          'status': {'phase': 'Running', 'containerStatuses': [{'ready': True, 'restartCount': 0}]}}
        self.assertNotIn('secret-value', str(normalize_resource(resource)))

if __name__ == '__main__': unittest.main()
