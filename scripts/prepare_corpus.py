#!/usr/bin/env python3
"""Cache PDF text/OCR and question candidates. Never promotes OCR to validated data.

Usage: python scripts/prepare_corpus.py --source PRIVATE_PDF_DIR --output PRIVATE_DIR
Outputs contain private source material and must stay outside this public repository.
Requires PyMuPDF; tesseract is required only for scanned/image-heavy pages.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

import fitz

VERSION = 3


def ocr_page(job):
    filename, page_no, cache = job
    if cache.exists():
        return json.loads(cache.read_text())
    with fitz.open(filename) as doc:
        page = doc[page_no]
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "page.png"
            page.get_pixmap(matrix=fitz.Matrix(200 / 72, 200 / 72), alpha=False).save(image)
            env = dict(os.environ, OMP_THREAD_LIMIT="1")
            result = subprocess.run(["tesseract", str(image), "stdout", "--psm", "3"],
                                    capture_output=True, text=True, env=env, timeout=90)
            if result.returncode:
                raise RuntimeError(f"OCR failed: {Path(filename).name} page {page_no + 1}")
            record = {"page": page_no + 1, "text": result.stdout,
                      "method": "tesseract-200dpi", "review_required": True}
            cache.write_text(json.dumps(record, ensure_ascii=False))
            return record


def candidates(pages):
    # Strict question-start anchors, not references such as 'Q.1 to Q.25'.
    pattern = re.compile(r"(?m)^[ \t]*Q(?:uestion\s+Number\s*:\s*|\s*[.．]?\s*(?:No\.?)?\s*)(\d{1,3})[_.:)]?[ \t]*([^\n]*)")
    found = []
    for page in pages:
        sources = [page.get("ocr_text", ""), page.get("raw_text", ""), page["text"]]
        text = max(sources, key=lambda s: len(list(pattern.finditer(s))))
        hits = []
        for match in pattern.finditer(text):
            if re.match(r"(?:to|[-–—]|carry|and\s+Q|&)", match[2], re.I):
                continue
            if not 1 <= int(match[1]) <= 100:
                continue
            hits.append(match)
        for index, hit in enumerate(hits):
            end = hits[index + 1].start() if index + 1 < len(hits) else len(text)
            found.append({"number": int(hit[1]), "page": page["page"],
                          "text_candidate": text[hit.start():end].strip(),
                          "extraction": "ocr" if text == page.get("ocr_text") else "pdf-text",
                          "validation_state": "in_review",
                          "review_flags": ["boundary_review", "equation_figure_review", "paper_key_identity_review"],
                          "continuation_may_follow": index + 1 == len(hits)})
    return found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    out = args.output.resolve()
    if out == repo or repo in out.parents:
        parser.error("Private extracted material must be written outside the public repository")
    out.mkdir(parents=True, exist_ok=True)
    cache = out / "ocr-cache"
    cache.mkdir(exist_ok=True)
    papers, jobs = [], []
    for filename in sorted(args.source.glob("*.pdf")):
        digest = hashlib.sha256(filename.read_bytes()).hexdigest()
        target = out / (filename.stem + ".json")
        previous = json.loads(target.read_text()) if target.exists() else {}
        if previous.get("sha256") == digest and previous.get("pipeline_version") == VERSION:
            papers.append(previous)
            continue
        with fitz.open(filename) as doc:
            pages = []
            for n, page in enumerate(doc):
                text = page.get_text(sort=True)
                # Sparse text over a scanned question is not a usable text layer.
                image_area = sum(fitz.Rect(i["bbox"]).get_area() for i in page.get_image_info())
                image_heavy = image_area / page.rect.get_area() > .45
                needs_ocr = len(re.sub(r"\s", "", text)) < 100 or image_heavy
                record = {"page": n + 1, "text": text, "raw_text": page.get_text(sort=False), "width": page.rect.width,
                          "height": page.rect.height, "image_heavy": image_heavy,
                          "needs_ocr": needs_ocr}
                if needs_ocr:
                    jobs.append((str(filename), n, cache / f"{digest[:16]}-{n+1}.json"))
                pages.append(record)
        papers.append({"file": filename.name, "sha256": digest, "pages": pages,
                       "pipeline_version": VERSION})
    print(f"{len(papers)} PDFs; {sum(len(p['pages']) for p in papers)} pages; {len(jobs)} OCR/cache jobs", flush=True)
    ocr_results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        future_jobs = {pool.submit(ocr_page, j): j for j in jobs}
        for done, future in enumerate(concurrent.futures.as_completed(future_jobs), 1):
            job = future_jobs[future]
            try:
                ocr_results[(Path(job[0]).name, job[1] + 1)] = future.result()
            except Exception as exc:
                ocr_results[(Path(job[0]).name, job[1] + 1)] = {"error": str(exc)}
            if done % 40 == 0:
                print(f"OCR/cache completed {done}/{len(jobs)}", flush=True)
    inventory = []
    for paper in papers:
        for page in paper["pages"]:
            result = ocr_results.get((paper["file"], page["page"]))
            if result:
                page["ocr_text"] = result.get("text", "")
                if result.get("error"):
                    page["ocr_error"] = result["error"]
        paper["question_candidates"] = candidates(paper["pages"])
        (out / (Path(paper["file"]).stem + ".json")).write_text(json.dumps(paper, ensure_ascii=False))
        inventory.append({"file": paper["file"], "sha256": paper["sha256"],
                          "pages": len(paper["pages"]),
                          "ocr_pages": sum(p["needs_ocr"] for p in paper["pages"]),
                          "ocr_errors": sum(bool(p.get("ocr_error")) for p in paper["pages"]),
                          "candidate_questions": len(paper["question_candidates"]),
                          "validated_by_pipeline": 0})
    (out / "inventory.json").write_text(json.dumps(inventory, indent=2))
    print(json.dumps(inventory, indent=2))


if __name__ == "__main__":
    main()
