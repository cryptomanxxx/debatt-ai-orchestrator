import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec=importlib.util.spec_from_file_location('water',Path(__file__).resolve().parents[1]/'scripts/shallow_water.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)


class Numerics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.a=w.system_matrix();cls.net=w.Network();cls.training=cls.net.train(cls.a)

    def test_training_and_independent_controls(self):
        self.assertLess(self.training['finalLoss'],self.training['initialLoss']/10)
        self.assertGreater(self.training['physicsLoss'],0)
        control=w.controls(self.a,self.net)
        self.assertLess(control['networkGradientMaxError'],1e-7)
        self.assertLess(control['linearUkfAgainstKalmanMaxError'],1e-10)
        # Test both undamped skew-symmetry/energy and fixed zero-mode mass.
        cfg=w.CFG|{'dragPerSecond':0}
        a=w.system_matrix(cfg)
        np.testing.assert_allclose(a+a.T,0,atol=1e-15)
        q=np.array([.01,-.02,.02,.03]);h,_=w.fields(q)
        self.assertAlmostEqual(float(h.mean()),w.CFG['depthM'])
        exact=w.exact_transition(a,2)
        self.assertAlmostEqual(float(np.linalg.norm(exact@q)),float(np.linalg.norm(q)),places=12)

    def test_future_observations_and_future_truth_do_not_change_issued_forecasts(self):
        truth,obs,mask,_=w.generate_test('20261008',2)
        original=w.evaluate_method(self.net.predict,True,truth,obs,mask)
        changed=obs.copy();changed[41:]+=.3
        other=w.evaluate_method(self.net.predict,True,truth,changed,mask)
        self.assertEqual(original['trace'][:40],other['trace'][:40])
        self.assertEqual([r for r in original['forecasts'] if r['originStep']<=40],
                         [r for r in other['forecasts'] if r['originStep']<=40])
        fake_truth=truth.copy();fake_truth[41:]+=1
        scored=w.evaluate_method(self.net.predict,True,fake_truth,obs,mask)
        for p,q in zip(original['forecasts'],scored['forecasts']):
            self.assertEqual(p['mean'],q['mean']);self.assertEqual(p['covariance'],q['covariance'])
        for p,q in zip(original['trace'],scored['trace']):
            self.assertEqual(p['mean'],q['mean']);self.assertEqual(p['rUsed'],q['rUsed'])

    def test_adaptation_is_lagged_and_missing_measurements_are_not_invented(self):
        truth,obs,mask,_=w.generate_test('7',2)
        result=w.evaluate_method(self.net.predict,True,truth,obs,mask)
        trace=result['trace']
        for old,new in zip(trace,trace[1:]):
            self.assertEqual(old['rNext'],new['rUsed'])
        for row in trace:
            if row['step']%5==0:
                self.assertIsNone(row['nisPerObservedSensor'])
                self.assertEqual(row['rUsed'],row['rNext'])
        self.assertGreater(result['metrics']['minimumCovarianceEigenvalue'],0)
        self.assertGreater(result['metrics']['minimumEstimatedDepthM'],0)

    def test_seed_changes_test_data_but_not_offline_training(self):
        a=w.generate_test('1',0);b=w.generate_test('2',0)
        self.assertFalse(np.array_equal(a[0],b[0]))
        self.assertFalse(np.array_equal(a[1],b[1]))
        other=w.Network();other.train(self.a)
        for p,q in zip(self.net.params,other.params):np.testing.assert_array_equal(p,q)
        # No filtering at all is a valid sensor-dropout limit.
        mask=np.zeros_like(a[2]);result=w.evaluate_method(self.net.predict,True,a[0],a[1],mask)
        self.assertTrue(all(r['nisPerObservedSensor'] is None for r in result['trace']))

    def test_invalid_covariance_and_input_abort(self):
        with self.assertRaises(ValueError):w.positive_covariance(np.diag([-1.,1,1,1]))
        for seed,case in [('1',True),('bad',0),('1234567890',0),('1',3)]:
            with self.assertRaises(ValueError):w.experiment(seed,case)


if __name__=='__main__':unittest.main()
