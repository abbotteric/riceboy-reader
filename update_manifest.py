#!/usr/bin/env python3
"""Re-bake reader/comics.js from rice-boy.com's archive pages.

The reader is fully static; this script refreshes the baked-in page counts
and chapter lists (mainly for 3rd Voice, which is ongoing — the app also
discovers new pages client-side, but new *chapters* only appear by re-baking).
Run it occasionally, then redeploy/copy reader/ wherever it's hosted.
"""

import html
import json
import os
import re
import time
import urllib.request

ORIGIN = "https://rice-boy.com"
USER_AGENT = "riceboy-personal-reader/1.0 (manifest refresh)"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "comics.js")

COMICS = [
    {"slug": "rb", "title": "Rice Boy", "ongoing": False},
    {"slug": "oot", "title": "Order of Tales", "ongoing": False},
    {"slug": "vattu", "title": "Vattu", "ongoing": False},
    {"slug": "3rdvoice", "title": "3rd Voice", "ongoing": True},
]

TOKEN_RE = re.compile(
    r"<h1>(?P<h1>.*?)</h1>"
    r"|<smallcaps>(?P<sc>.*?)</smallcaps>"
    r"|<a href=[\"']index\.php\?c=(?P<page>\d+)[\"']",
    re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


def clean_heading(raw):
    text = html.unescape(TAG_RE.sub(" ", raw))
    return re.sub(r"\s+", " ", text).strip().rstrip(":").strip()


def parse_archive(page_html):
    """Return (page_count, chapters) from an index.php archive page.

    A heading (<h1> or <smallcaps>) becomes a chapter if a page link follows
    it before the next heading. 3rd Voice nests <smallcaps> chapters under
    <h1> section dividers on the same start page: generic "Argument" headings
    get the section prefix, and the later heading wins a shared start page.
    """
    max_page = 0
    chapters = {}
    pending = None
    section = None
    for m in TOKEN_RE.finditer(page_html):
        if m.group("page") is not None:
            n = int(m.group("page"))
            max_page = max(max_page, n)
            if pending:
                chapters[n] = pending
                pending = None
        else:
            heading = clean_heading(m.group("h1") or m.group("sc") or "")
            if not heading:
                continue
            if m.group("h1") is not None:
                section = heading
            elif heading == "Argument" and section:
                heading = f"{section}: Argument"
            pending = heading
    return max_page, [{"title": t, "start": s} for s, t in sorted(chapters.items())]


def main():
    comics = []
    for i, comic in enumerate(COMICS):
        if i:
            time.sleep(1)
        url = f"{ORIGIN}/{comic['slug']}/index.php"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", "replace")
        pages, chapters = parse_archive(body)
        if pages == 0:
            raise ValueError(f"no pages parsed from {url}")
        print(f"{comic['slug']}: {pages} pages, {len(chapters)} chapters")
        comics.append({**comic, "pages": pages, "chapters": chapters})
    manifest = {"generated": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "comics": comics}
    with open(OUT, "w") as f:
        f.write("// Baked comic manifest — regenerate with: python3 update_manifest.py\n")
        f.write("window.COMICS_DATA = " + json.dumps(manifest, indent=2) + ";\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
