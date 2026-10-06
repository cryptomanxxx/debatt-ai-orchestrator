import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('science_bridge',ROOT/'scripts/science_bridge.py')
bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)


class ScienceTests(unittest.TestCase):
    def test_upstream_bytes(self):
        expected={'annihilator/annihilator.py':'82f48d1bf3efda475a2e8fbc2e4e09ee9c5018dab606d117c36f71a51ef8a7d4',
                  'mixalot/frozen_comp_v1.py':'93384c74011984894274b9b5c723f9f52f7365e2565c5e0ee2ad795bc35b421f',
                  'mixalot/frozen_comp_blind.py':'5b12c142508bcc1c9ab933b58c45b5b7e96df94d1363fbeaa1e19f66cfb42e7c'}
        self.assertEqual(bridge.MANIFEST['sourceSha256'],expected)
        for name,digest in expected.items():
            self.assertEqual(hashlib.sha256((ROOT/'vendor/bootloops'/name).read_bytes()).hexdigest(),digest)
        self.assertEqual(bridge.MANIFEST['packages'],dict(line.split('==') for line in (ROOT/'research/requirements.lock').read_text().splitlines()))

    def test_recurrence_positive_negative_and_refusal(self):
        values=[1,1]
        for _ in range(28):values.append(sum(values[-2:]))
        good={'train':list(map(str,values[:24])),'holdout':list(map(str,values[24:]))}
        r=bridge.compute('annihilator',good)['result']
        self.assertTrue(r['accepted']);self.assertEqual(r['coefficients'],['-1','-1','1'])
        bad=json.loads(json.dumps(good));bad['holdout'][0]=str(int(bad['holdout'][0])+1)
        result=bridge.compute('annihilator',bad)['result']
        self.assertFalse(result['accepted']);self.assertGreater(result['failed'],0)
        self.assertEqual(r['coefficients'],result['coefficients'])
        irregular={'train':[str(n**3) for n in range(24)],'holdout':[str(n**3) for n in range(24,30)]}
        self.assertFalse(bridge.compute('annihilator',irregular)['result']['found'])

    def test_mixture_matches_analytic_fraction_and_controls(self):
        r=bridge.compute('mixalot',{'counts':[1,3]})['result']
        self.assertEqual(r['bayesFactor10'],'761/1280')
        self.assertEqual(r['posteriorH1'],'761/2041')
        self.assertEqual(bridge.compute('mixalot',{'counts':[0,24]})['result']['decision'],'supports_h0')
        self.assertEqual(bridge.compute('mixalot',{'counts':[12,12]})['result']['decision'],'supports_h1')

    def test_timing_and_analytic_null_regression(self):
        train=[str([1,0,-1,0][i%4]) for i in range(65)]
        r=bridge.compute('statsmodels',{'train':train,'holdout':['0','-1','0','1']})['result']
        self.assertAlmostEqual(r['phi'],0);self.assertAlmostEqual(r['pvalue'],1)
        self.assertEqual(r['decision'],'do_not_reject_h0')
        self.assertEqual(r['dfResidual'],62)
        self.assertTrue(r['independentRouteMatched'])
        # Changing only the external holdout never changes fit or hypothesis evidence.
        changed=bridge.compute('statsmodels',{'train':train,'holdout':['4','3','2','1']})['result']
        for key in ['phi','pvalue','standardError','decision','confidenceInterval95']:
            self.assertEqual(r[key],changed[key])
        self.assertNotEqual(r['holdoutRmse'],changed['holdoutRmse'])

    def test_input_fences_and_unknown_operation(self):
        requests=[('mixalot',{'counts':[True,3]}),('mixalot',{'counts':[1.2,3]}),('mixalot',{'counts':[40,40]}),
                  ('mixalot',{'counts':[-1,9]}),('mixalot',{'counts':[1,3],'code':'exec'}),
                  ('annihilator',{'train':['0']*24,'holdout':['0']*6}),
                  ('statsmodels',{'train':['nan']*65,'holdout':['1']*4}),
                  ('statsmodels',{'train':['1']*65,'holdout':['1']*4}),('shell',{})]
        for tool,data in requests:
            with self.subTest(tool=tool,data=data),self.assertRaises((ValueError,KeyError)):
                bridge.compute(tool,data)
        r=subprocess.run([sys.executable,'-I',str(ROOT/'scripts/science_bridge.py'),'mixalot'],input=b'x'*16385,capture_output=True,timeout=5)
        self.assertEqual(r.returncode,1);self.assertEqual(json.loads(r.stdout),{'error':'science_tool_execution_failed'})

    def test_dependency_and_source_drift_refuse(self):
        with patch.object(bridge.importlib.metadata,'version',return_value='wrong'):
            with self.assertRaises(ValueError):bridge.compute('mixalot',{'counts':[1,3]})
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'vendor/bootloops/mixalot/frozen_comp_v1.py';source.parent.mkdir(parents=True)
            source.write_text('raise RuntimeError("must not execute")')
            with patch.object(bridge,'ROOT',root):
                with self.assertRaisesRegex(ValueError,'source drift'):bridge.pinned_module('mixalot/frozen_comp_v1.py')
