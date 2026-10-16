import json
import tempfile
import unittest
from pathlib import Path
import importlib.util

SPEC = importlib.util.spec_from_file_location("causal_literature_index", Path(__file__).resolve().parents[1] / "research" / "causal_literature_index.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

def paper(identifier, source="openalex", abstract=None):
    return {"doi": identifier, "title": "Causal effect of oxygen transport in ecological systems",
            "abstract": abstract or "Experimental effects of oxygen transport were measured across controlled systems and evaluated for associations.",
            "source": source, "year": 2025}

class IngestionTests(unittest.TestCase):
    def test_provenance_and_no_certified_science(self):
        with tempfile.TemporaryDirectory() as folder:
            src, out = Path(folder)/"input.jsonl", Path(folder)/"report.json"
            src.write_text("\n".join(map(json.dumps, [paper("10.5555/alpha"), paper("10.5555/beta", "semantic_scholar")]))+"\n")
            result = mod.run(src, out)
            self.assertEqual(result["record_count"], 2)
            self.assertEqual(result["retrieval_leads_count"], 1)
            self.assertEqual(result["accepted_causal_claims"], [])
            self.assertFalse(result["records"][0]["causal_structure_extracted"])
            self.assertEqual(json.loads(out.read_text())["input_sha256"], result["input_sha256"])

    def test_duplicate_and_conflict(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)/"input.jsonl"
            p.write_text("\n".join(json.dumps(x) for x in [paper("10.5555/one"),
                paper("10.5555/one"), paper("10.5555/one", abstract="Alternative experimental report with observations of manipulated oxygen and downstream transport.")])+"\n")
            records, fail, duplicates = mod.ingest(p)
            self.assertEqual((len(records), duplicates, fail.get("conflicting_duplicate")), (1, 2, 1))

    def test_invalid_untrusted_rows_and_limits(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)/"in"
            p.write_bytes(b"{bad\n" + b"x" * 33000 + b"\n" + (json.dumps(paper("10.5555/good"))+"\n").encode())
            records, fail, duplicates = mod.ingest(p)
            self.assertEqual(len(records), 1)
            self.assertEqual(fail["invalid_json"], 1)
            self.assertEqual(fail["oversized_line"], 1)
            self.assertRaises(ValueError, mod.ingest, p, 10001)

    def test_no_claims_from_causal_words_alone(self):
        record, error = mod.normalize(paper("10.5555/claim", abstract="We causally prove the mechanism is true with no uncertainty and huge intervention effects."))
        self.assertIsNone(error)
        self.assertIn("causal_language", record["cues"])
        self.assertEqual(record["epistemic_status"], "unverified_literature_metadata")
        self.assertFalse(record["causal_structure_extracted"])

    def test_no_cross_source_lead_without_shared_terms(self):
        a, _ = mod.normalize(paper("10.5555/a", "openalex"))
        b, _ = mod.normalize({"doi": "10.5555/b", "source": "core", "title": "Quantum spin lattice fluid textures",
                               "abstract": "A novel lattice crystallography process controls quantum phase oscillations under pressure fluctuations."})
        self.assertEqual(mod.candidate_pairs([a,b]), [])


    def test_streaming_hash_identifiers_and_malformed_rows(self):
        import hashlib
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder)/"input.jsonl", Path(folder)/"out.json"
            a = {**paper("10.5555/first", "OpenAlex"), "doi": None, "id": "123"}
            b = {**paper("10.5555/second", "CORE"), "doi": None, "id": "123"}
            source.write_text("\\n".join(json.dumps(x) for x in [a,b])+ "\\n")
            report = mod.run(source, output)
            self.assertEqual(report["record_count"], 2)
            self.assertEqual(report["input_sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertEqual(sorted(x["source"] for x in report["records"]), ["core", "openalex"])
            invalid, err = mod.normalize({**a, "id": "    "})
            self.assertIsNone(invalid)
            self.assertEqual(err, "missing_identifier")
            self.assertIn("study", mod.STOP)

if __name__ == "__main__":
    unittest.main()
