"""Acceptance gates for our bounded sparse integration, not the full package."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from fractions import Fraction as F

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rankscreen_bridge', ROOT / 'scripts/rankscreen_bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class RankscreenTests(unittest.TestCase):
    def test_upstream_source_pins(self):
        expected = {'screen.py': 'd8a9c3cd571ae906538a9ba916f79f6a06041778bf2becc19b5b833627a2b058',
                    'modp_rref.py': '1cdee1918c9126cb63042bdda3e9a951daa1c64825f5ba327d82eaaf2dfa3c2f'}
        self.assertEqual(bridge.PINS, expected)
        for name, digest in expected.items():
            self.assertEqual(hashlib.sha256((bridge.ROOT / name).read_bytes()).hexdigest(), digest)

    def test_positive_and_negative(self):
        for rhs, consistent in [('6', True), ('7', False)]:
            r = bridge.compute({'rows': [['1','2','3'], ['2','4',rhs]]})['receipt']
            self.assertEqual(r['rank'], 1)
            self.assertEqual(r['n_inconsistent'] == 0, consistent)
            self.assertFalse(r['closure_candidate'])
            self.assertEqual(r['k'], 3)

    def test_disagreement_requires_escalation_not_majority(self):
        tool = bridge.load_tool()
        from modp_rref import PRIMES_SPARSE
        p = PRIMES_SPARSE[0]
        r = tool([({0: F(p)}, F(0))], ncols=1, k=3, backend='sparse')
        self.assertEqual(r['verdict'], 'ESCALATE-TO-EXACT')
        self.assertIsNone(r['rank'])
        self.assertNotIn('closure_candidate', r)

    def test_bad_denominator_replaced_and_receipted(self):
        tool = bridge.load_tool()
        from modp_rref import PRIMES_SPARSE, BadPrime
        p = PRIMES_SPARSE[0]
        rows = [({0: F(1,p)}, F(0))]
        r = tool(rows, ncols=1, k=3, backend='sparse')
        self.assertEqual(r['primes_replaced'][0]['prime'], p)
        self.assertNotIn(p, r['primes'])
        with self.assertRaises(BadPrime):
            tool(rows, ncols=1, k=2, backend='sparse', primes=[p,p])

    def test_bounded_input(self):
        for data in [{'rows': []}, {'rows': [['1','2'],['1','2']], 'code': 'eval'},
                     {'rows': [['1','2'],['1']]}, {'rows': [['1','1e9'],['1','2']]},
                     {'rows': [[1,'2'],['1','2']]}, {'rows': [['1','1000000000'],['1','2']]}]:
            with self.assertRaises(ValueError):
                bridge.compute(data)
        result = subprocess.run([sys.executable, '-I', str(ROOT / 'scripts/rankscreen_bridge.py')],
                                input=b'x'*16385, capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {'error': 'rankscreen_execution_failed'})
