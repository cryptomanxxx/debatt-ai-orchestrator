"""Bounded, provenance-first scientific metadata ingestion and candidate graph generation.

Inputs are caller-provided JSONL metadata/abstract records; this does NOT fetch
articles, validate causal claims or grant VEM-Sci acceptance.
"""
import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

MAX_RECORDS = 10000
MAX_LINE = 32768
MAX_ABSTRACT = 8000
MAX_PAIRS = 5000
STOP = frozenset(("the and for with from this that into were have been their about using study studies results effect effects between among through these those which where shows showed analysis model models method methods data significant significantly evidence association associated relationship relationships causal causally cause causes impact impacts intervention interventions treatment treatments of on in to a an is are was by as at or we our it its be can may not no than vs via under over after before based report reported suggest suggests".split()))
CUES = {
    "intervention_mentioned": re.compile(r"\b(randomi[sz]ed|interven(?:tion|ed|ing)|do\s*\(|experiment(?:al)?|controlled trial)\b", re.I),
    "causal_language": re.compile(r"\b(causal|caused|causes|leads to|affects|effect of|intervention)\b", re.I),
    "association_language": re.compile(r"\b(associat(?:ed|ion)|correlat(?:ion|ed)|linked to)\b", re.I),
}
TOKEN = re.compile(r"[a-zA-Z][a-zA-Z0-9-]{3,}")
DOI = re.compile(r"^10\.\d{4,9}/\S+$", re.I)

def sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def digest_file(path):
    digest = hashlib.sha256()
    total = 0
    with open(path, "rb") as stream:
        while chunk := stream.read(65536):
            total += len(chunk)
            if total > MAX_RECORDS * MAX_LINE:
                raise ValueError("input_size_exceeded")
            digest.update(chunk)
    return digest.hexdigest()

def normalize(record):
    if not isinstance(record, dict):
        return None, "invalid_schema"
    title, abstract = record.get("title"), record.get("abstract")
    if not isinstance(title, str) or not 5 <= len(title.strip()) <= 500:
        return None, "invalid_title"
    if not isinstance(abstract, str) or not 30 <= len(abstract.strip()) or len(abstract.encode("utf-8", errors="surrogatepass")) > MAX_ABSTRACT:
        return None, "invalid_abstract"
    has_doi = bool(record.get("doi"))
    identifier = record.get("doi") or record.get("id")
    if not isinstance(identifier, str):
        return None, "missing_identifier"
    identifier = identifier.strip()
    if has_doi:
        identifier = identifier.lower()
    if identifier.startswith("https://doi.org/"):
        identifier = identifier[len("https://doi.org/"):]
    if identifier.startswith("doi:"):
        identifier = identifier[4:]
    if not 3 <= len(identifier) <= 300 or any(ord(c) < 32 for c in identifier):
        return None, "invalid_identifier"
    if has_doi and not DOI.fullmatch(identifier):
        return None, "invalid_doi"
    source = record.get("source", "unknown")
    if not isinstance(source, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,40}", source):
        return None, "invalid_source"
    source = source.lower()
    year = record.get("year")
    if year is not None and (type(year) is not int or year < 1900 or year > 2100):
        return None, "invalid_year"
    title, abstract = title.strip(), abstract.strip()
    try:
        title.encode("utf-8")
        abstract.encode("utf-8")
        identifier.encode("utf-8")
    except UnicodeError:
        return None, "invalid_unicode"
    return {"id": identifier, "id_kind": "doi" if has_doi else "provider", "source": source, "sources": [source], "year": year, "title": title,
            "abstract_sha256": sha(abstract), "title_sha256": sha(title),
            "cues": sorted(k for k, rx in CUES.items() if rx.search(abstract)),
            "tokens": sorted({m.group().lower() for m in TOKEN.finditer(title + " " + abstract)
                              if m.group().lower() not in STOP})[:300],
            "epistemic_status": "unverified_literature_metadata",
            "causal_structure_extracted": False}, None

def ingest(path, limit=MAX_RECORDS):
    if not 1 <= limit <= MAX_RECORDS:
        raise ValueError("invalid_limit")
    records, failures, duplicates = {}, defaultdict(int), 0
    with open(path, "rb") as source:
        for line_number in range(limit + 1):
            raw = source.readline(MAX_LINE + 1)
            if not raw:
                break
            if line_number == limit:
                failures["limit_exceeded"] += 1
                break
            if len(raw) > MAX_LINE or not raw.endswith(b"\n") and len(raw) == MAX_LINE + 1:
                failures["oversized_line"] += 1
                if not raw.endswith(b"\n"):
                    while chunk := source.readline(MAX_LINE + 1):
                        if chunk.endswith(b"\n"):
                            break
                continue
            try:
                decoded = raw.decode("utf-8")
                obj = json.loads(decoded)
            except (UnicodeError, ValueError, RecursionError):
                failures["invalid_json"] += 1
                continue
            normalized, error = normalize(obj)
            if error:
                failures[error] += 1
                continue
            identifier = ("doi", normalized["id"]) if normalized["id_kind"] == "doi" else (normalized["source"], normalized["id"])
            if identifier in records:
                duplicates += 1
                records[identifier]["sources"] = sorted(set(records[identifier]["sources"] + [normalized["source"]]))
                if records[identifier]["abstract_sha256"] != normalized["abstract_sha256"]:
                    failures["conflicting_duplicate"] += 1
                continue
            records[identifier] = normalized
    return [records[k] for k in sorted(records)], dict(sorted(failures.items())), duplicates

def candidate_pairs(records, limit=MAX_PAIRS):
    """Conservative retrieval leads, NOT inferred cross-domain mechanisms."""
    if not 0 <= limit <= MAX_PAIRS:
        raise ValueError("invalid_pair_limit")
    postings = defaultdict(list)
    for i, record in enumerate(records):
        # Title tokens are unavailable separately in the indexed record; these
        # are bounded lexical metadata fingerprints, not mechanistic similarity.
        for word in record["tokens"]:
            postings[word].append(i)
    counts = defaultdict(int)
    # Explicit work bound: never materialize an unbounded all-pairs index.
    max_candidates = max(10000, limit * 20)
    work = 0
    max_work = 250000
    for word in sorted(postings):
        indices = postings[word]
        if len(indices) < 2 or len(indices) > 50:
            continue
        for left_pos, left in enumerate(indices):
            for right in indices[left_pos + 1:]:
                if records[left]["source"] == records[right]["source"]:
                    continue
                work += 1
                if work > max_work:
                    break
                key = (left, right)
                if key in counts or len(counts) < max_candidates:
                    counts[key] += 1
            if work > max_work:
                break
        if work > max_work:
            break
    ranked = sorted(((count, i, j) for (i, j), count in counts.items() if count >= 2),
                    key=lambda x: (-x[0], records[x[1]]["id"], records[x[2]]["id"]))
    return [{"paper_ids": [records[i]["id"], records[j]["id"]],
             "paper_refs": [{"source": records[k]["source"], "id": records[k]["id"]} for k in (i, j)],
             "shared_term_count": count,
             "status": "unverified_cross_source_retrieval_lead",
             "requires": ["full_text_review", "explicit_causal_model_extraction",
                          "independent_intervention_validation"]}
            for count, i, j in ranked[:limit]]

def run(input_path, output_path, max_records=MAX_RECORDS, max_pairs=MAX_PAIRS):
    records, failures, duplicates = ingest(input_path, max_records)
    pairs = candidate_pairs(records, max_pairs)
    report = {"schema_version": "causal-literature-index-v0.1",
              "source_type": "user_supplied_jsonl", "input_sha256": digest_file(input_path),
              "record_count": len(records), "duplicate_count": duplicates, "rejections": failures,
              "retrieval_leads_count": len(pairs), "accepted_causal_claims": [],
              "records": records, "retrieval_leads": pairs,
              "limitations": ("Lexical retrieval on bounded abstracts; no full-text access, causal graph "
                              "identification, statistical tests, ACT-MAP integration or verified findings. "
                              "All leads and literature statements remain unverified.")}
    dest = Path(output_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return report

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="reports/causal-literature/report.json")
    parser.add_argument("--max-records", type=int, default=MAX_RECORDS)
    parser.add_argument("--max-pairs", type=int, default=MAX_PAIRS)
    args = parser.parse_args()
    result = run(args.input, args.output, args.max_records, args.max_pairs)
    print(json.dumps({"records": result["record_count"], "leads": result["retrieval_leads_count"],
                      "rejections": result["rejections"], "accepted_causal_claims": 0}))
