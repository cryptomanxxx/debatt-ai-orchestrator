"""Offline regression tests for scientific answer validation; no Blablador calls."""
import unittest
from blablador_scientific_v3 import evaluate


class ScientificValidatorTests(unittest.TestCase):
    def test_equivalent_fraction(self):
        self.assertEqual(evaluate("FINAL_ANSWER: 4/26", "2/13")[:2], ("correct", True))

    def test_decimal_equivalence(self):
        self.assertEqual(evaluate("FINAL_ANSWER: 2.0", "2")[:2], ("correct", True))

    def test_wrong_math(self):
        self.assertEqual(evaluate("FINAL_ANSWER: 3", "2")[:2], ("incorrect", True))

    def test_verbose_with_final_line(self):
        self.assertEqual(evaluate("Calculation gives 2.\nFINAL_ANSWER: 2", "2")[:2],
                         ("correct", False))

    def test_ambiguous_verbose(self):
        self.assertEqual(evaluate("Try 1 then 2 then 3", "2")[0], "unverified")

    def test_causal_case(self):
        self.assertEqual(evaluate("FINAL_ANSWER: Mediator", "mediator")[:2],
                         ("correct", True))


if __name__ == "__main__":
    unittest.main()
