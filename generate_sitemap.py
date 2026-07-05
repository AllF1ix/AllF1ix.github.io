#!/usr/bin/env python3
"""
generate_sitemap.py
--------------------
Awtomatikong gumagawa ng buong sitemap.xml para sa AllFlix, batay mismo sa
mga movie/TV na kinukuha ng site mula sa TMDB API (parehong endpoints at
pagkaka-slugify tulad ng ginagawa ng script.js sa browser).

Bakit kailangan ito:
  Ang site ay isang Single Page Application (GitHub Pages, static hosting
  lang). Ang mga URL tulad ng /movie/avatar-2009-19995 ay hindi totoong mga
  file/page — ginagawa lang ito ng JavaScript (history.pushState) sa
  browser mismo. Kaya hindi awtomatikong nalalaman ni Google kung anong mga
  URL ang meron ka. Ito ang script na "nagsasabi" kay Google ng buong
  listahan, para ma-crawl at ma-index niya lahat.

Paano ito ginagamit: tumatakbo ito araw-araw via GitHub Actions
(.github/workflows/update-sitemap.yml), at awtomatikong ida-commit ang
bagong sitemap.xml kung may pagbabago.
"""

import os
import re
import sys
import unicodedata
from datetime import date, timezone
from xml.sax.saxutils import escape

import requests

# ===================== CONFIG (dapat tugma sa script.js) =====================
BASE_URL = "https://api.themoviedb.org/3"
SITE_URL = "https://allf1ix.github.io"  # walang trailing slash

# Parehong TMDB Read Access Token na ginagamit ng script.js (public na rin
# ito doon). Pwede ring ilagay bilang GitHub Actions secret na TMDB_TOKEN
# kung gusto mong gumamit ng ibang token dito.
ACCESS_TOKEN = os.environ.get(
    "TMDB_TOKEN",
    "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3NGNiYzA3NTJlMGEzNmZkYWM2NjU3YmIyMDZmMGJlYyIsIm5iZiI6MTc4Mjk0Nzk2NS43MTEsInN1YiI6IjZhNDVhMDdkZWI1NWZjYzQ2YjQ5ZTM5MyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ilS0nk-zuZzmHq75FG6rk-1y-bcua8J6aAUC-ddcnvc",
)

HEADERS = {"accept": "application/json", "Authorization": f"Bearer {ACCESS_TOKEN}"}

# Katumbas ng CATALOG_PAGES sa script.js (50 pages x 20 items = 1000 movies,
# 1000 TV shows). Pwede mong bawasan ito (hal. 20) kung gusto mong mas mabilis
# tumakbo ang job, pero mas kaunti ring ma-i-sitemap.
CATALOG_PAGES = 50

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "sitemap.xml")


def slugify(text: str) -> str:
    """Eksaktong katumbas ng slugify() sa script.js."""
    if not text:
        text = ""
    normalized = unicodedata.normalize("NFKD", text)
    without_accents = "".join(c for c in normalized if not unicodedata.combining(c))
    lowered = without_accents.lower()
    dashed = re.sub(r"[^a-z0-9]+", "-", lowered)
    trimmed = dashed.strip("-")
    result = trimmed[:60]
    return result or "title"


def build_detail_path(item_id, kind: str, title: str, year: str) -> str:
    """Eksaktong katumbas ng buildDetailPath() sa script.js."""
    base = slugify(title)
    slug = f"{base}-{year}" if year else base
    return f"/{kind}/{slug}-{item_id}"


def fetch_json(url: str):
    try:
        res = requests.get(url, headers=HEADERS, timeout=15)
        res.raise_for_status()
        return res.json()
    except requests.RequestException as e:
        print(f"  ! Failed: {url} -> {e}", file=sys.stderr)
        return None


def fetch_many_pages(base_url: str, total_pages: int):
    """Katumbas ng fetchManyPages() sa script.js."""
    sep = "&" if "?" in base_url else "?"
    combined = []
    for page in range(1, total_pages + 1):
        data = fetch_json(f"{base_url}{sep}page={page}")
        if data and data.get("results"):
            combined.extend(data["results"])
        else:
            break  # walang laman na ibang pages pagkatapos nito
    return combined


def collect_all_items():
    """Kunin lahat ng movies/TV na ipinapakita ng site (trending + catalogs)."""
    seen = {}  # (type, id) -> item dict

    def add_items(items, forced_type=None):
        for item in items:
            item_id = item.get("id")
            if item_id is None:
                continue
            media_type = forced_type or item.get("media_type") or (
                "tv" if item.get("first_air_date") else "movie"
            )
            if media_type not in ("movie", "tv"):
                continue
            title = item.get("title") or item.get("name")
            if not title:
                continue
            year = (item.get("release_date") or item.get("first_air_date") or "")[:4]
            seen[(media_type, item_id)] = (title, year)

    print("Fetching trending...")
    trending = fetch_json(f"{BASE_URL}/trending/all/day")
    if trending:
        add_items(trending.get("results", []))

    print(f"Fetching movie catalog ({CATALOG_PAGES} pages)...")
    add_items(
        fetch_many_pages(f"{BASE_URL}/discover/movie?sort_by=popularity.desc", CATALOG_PAGES),
        forced_type="movie",
    )

    print(f"Fetching TV catalog ({CATALOG_PAGES} pages)...")
    add_items(
        fetch_many_pages(f"{BASE_URL}/discover/tv?sort_by=popularity.desc", CATALOG_PAGES),
        forced_type="tv",
    )

    return seen


def build_sitemap(items: dict) -> str:
    today = date.today().isoformat()
    urls = []

    # Homepage
    urls.append(
        f"  <url>\n"
        f"    <loc>{escape(SITE_URL)}/</loc>\n"
        f"    <lastmod>{today}</lastmod>\n"
        f"    <changefreq>daily</changefreq>\n"
        f"    <priority>1.0</priority>\n"
        f"  </url>"
    )

    for (media_type, item_id), (title, year) in sorted(items.items()):
        path = build_detail_path(item_id, media_type, title, year)
        loc = escape(f"{SITE_URL}{path}")
        urls.append(
            f"  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <changefreq>weekly</changefreq>\n"
            f"    <priority>0.8</priority>\n"
            f"  </url>"
        )

    body = "\n".join(urls)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        "</urlset>\n"
    )


def main():
    items = collect_all_items()
    print(f"Total unique movie/TV pages found: {len(items)}")

    xml = build_sitemap(items)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(xml)

    print(f"Sitemap written to {os.path.abspath(OUTPUT_PATH)} ({len(items) + 1} URLs total)")


if __name__ == "__main__":
    main()
