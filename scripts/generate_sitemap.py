#!/usr/bin/env python3
import os
import re
import sys
import unicodedata
from datetime import date
from xml.sax.saxutils import escape

import requests

BASE_URL = "https://api.themoviedb.org/3"
SITE_URL = "https://allf1ix.github.io"

ACCESS_TOKEN = os.environ.get("TMDB_TOKEN") or "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3NGNiYzA3NTJlMGEzNmZkYWM2NjU3YmIyMDZmMGJlYyIsIm5iZiI6MTc4Mjk0Nzk2NS43MTEsInN1YiI6IjZhNDVhMDdkZWI1NWZjYzQ2YjQ5ZTM5MyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ilS0nk-zuZzmHq75FG6rk-1y-bcua8J6aAUC-ddcnvc"


HEADERS = {"accept": "application/json", "Authorization": f"Bearer {ACCESS_TOKEN}"}
CATALOG_PAGES = 50
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "sitemap.xml")


def slugify(text: str) -> str:
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
    sep = "&" if "?" in base_url else "?"
    combined = []
    for page in range(1, total_pages + 1):
        data = fetch_json(f"{base_url}{sep}page={page}")
        if data and data.get("results"):
            combined.extend(data["results"])
        else:
            break
    return combined


def collect_all_items():
    seen = {}

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

    urls.append(
        f"  <url>\n"
        f"    <loc>{escape(SITE_URL)}/</loc>\n"
        f"    <lastmod>{today}</lastmod>\n"
        f"    <changefreq>daily</changefreq>\n"
        f"    <priority>1.0</priority>\n"
        f"  </url>"
    )

    for path in ("/movies", "/tv-shows"):
        urls.append(
            f"  <url>\n"
            f"    <loc>{escape(SITE_URL + path)}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <changefreq>daily</changefreq>\n"
            f"    <priority>0.9</priority>\n"
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
