#!/usr/bin/env python3
import argparse
import re
import zipfile
from pathlib import Path
from collections import Counter

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)


def build_session() -> requests.Session:
    retry = Retry(
        total=5,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "HEAD"),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def clean_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    lines = [ln.strip() for ln in soup.get_text("\n").splitlines() if ln.strip()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls_file")
    ap.add_argument("--outdir", default="out_texts")
    ap.add_argument("--zip")
    ap.add_argument("--strip-common", action="store_true")
    args = ap.parse_args()

    raw = [ln.strip() for ln in Path(args.urls_file).read_text().splitlines() if ln.strip()]
    urls = [ln.split()[-1] for ln in raw]

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    session = build_session()
    texts = []
    failures = []
    for i, url in enumerate(urls, 1):
        try:
            r = session.get(url, timeout=30, allow_redirects=True)
            if r.status_code >= 400:
                failures.append((url, f"HTTP {r.status_code}"))
                continue
            text = clean_text(r.text)
            texts.append(text)
            (outdir / f"doc_{i:03d}.txt").write_text(text, encoding="utf-8")
        except Exception as exc:
            failures.append((url, str(exc)))

    if args.strip_common and len(texts) >= 3:
        counts = Counter()
        for t in texts:
            for ln in set(t.splitlines()):
                counts[ln] += 1
        common = {ln for ln, c in counts.items() if c >= int(len(texts) * 0.6)}
        for p in outdir.glob("doc_*.txt"):
            lines = [ln for ln in p.read_text().splitlines() if ln not in common]
            p.write_text("\n".join(lines))

    if failures:
        (outdir / "failures.txt").write_text(
            "\n".join(f"{u}\t{err}" for u, err in failures),
            encoding="utf-8",
        )

    if args.zip:
        with zipfile.ZipFile(args.zip, "w", zipfile.ZIP_DEFLATED) as z:
            for p in outdir.glob("doc_*.txt"):
                z.write(p, arcname=p.name)
            if failures:
                z.write(outdir / "failures.txt", arcname="failures.txt")


if __name__ == "__main__":
    main()
