"""Parse bounded arXiv Atom metadata with the standard XML parser; no network."""
import json
import sys
import xml.etree.ElementTree as ET

ATOM = "{http://www.w3.org/2005/Atom}"
ARXIV = "{http://arxiv.org/schemas/atom}"


def parse_feed(xml, include_abstract=False):
    if "<!DOCTYPE" in xml.upper() or "<!ENTITY" in xml.upper():
        raise ValueError("DTD and entities are not allowed")
    root = ET.fromstring(xml)
    if root.tag != ATOM + "feed":
        raise ValueError("Not an Atom feed")
    papers = []
    for entry in root.findall(ATOM + "entry"):
        def text(name):
            return " ".join(entry.findtext(name, default="").split())
        identifier = text(ATOM + "id")
        if identifier.startswith(("http://arxiv.org/api/errors", "https://arxiv.org/api/errors")):
            raise ValueError("arXiv returned an API error entry")
        paper = {"id": identifier, "title": text(ATOM + "title"),
                       "doi": text(ARXIV + "doi"),
                       "published": text(ATOM + "published"),
                       "updated": text(ATOM + "updated"),
                       "hasAbstract": bool(text(ATOM + "summary"))}
        if include_abstract:
            paper["abstract"] = text(ATOM + "summary")
        papers.append(paper)
    return papers


if __name__ == "__main__":
    try:
        xml = sys.stdin.read(2_000_001)
        if len(xml) > 2_000_000:
            raise ValueError("Feed too large")
        print(json.dumps(parse_feed(xml, include_abstract="--include-abstract" in sys.argv[1:])))
    except (ValueError, ET.ParseError):
        print("Invalid arXiv Atom response", file=sys.stderr)
        sys.exit(1)
