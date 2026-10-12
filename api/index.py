import asyncio
import os
import time
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from html import escape

from fastapi.responses import FileResponse, HTMLResponse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

load_dotenv()

app = FastAPI(title="NEXORmovies API")
TMDB_BASE = "https://api.themoviedb.org/3"
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
ROOT_DIR = Path(__file__).resolve().parent.parent
TMDB_KEY = os.getenv("TMDB_API_KEY", "")

GENRES = {
    "Action": 28, "Adventure": 12, "Animation": 16, "Comedy": 35,
    "Crime": 80, "Documentary": 99, "Drama": 18, "Family": 10751,
    "Fantasy": 14, "History": 36, "Horror": 27, "Music": 10402,
    "Mystery": 9648, "Romance": 10749, "Science Fiction": 878,
    "TV Movie": 10770, "Thriller": 53, "War": 10752, "Western": 37
}

# Small in-memory cache so repeat requests don't hit TMDB again.
# TMDB's terms allow caching for up to 6 months; we keep it to 1 hour.
_CACHE: dict = {}
CACHE_TTL = 60 * 60
CACHE_MAX = 500

async def tmdb(path: str, params: Optional[dict] = None):
    if not TMDB_KEY:
        raise HTTPException(500, "TMDB_API_KEY is not configured.")

    params = dict(params or {})
    key = (path, tuple(sorted((k, str(v)) for k, v in params.items())))
    now = time.time()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < CACHE_TTL:
        return hit[1]

    params["api_key"] = TMDB_KEY
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{TMDB_BASE}{path}", params=params)

    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text)

    data = r.json()
    if len(_CACHE) >= CACHE_MAX:
        _CACHE.pop(next(iter(_CACHE)))  # drop the oldest entry
    _CACHE[key] = (now, data)
    return data

def normalize_movie(m):
    return {
        "id": m.get("id"),
        "title": m.get("title") or m.get("name") or "Untitled",
        "overview": m.get("overview") or "",
        "poster_path": m.get("poster_path"),
        "backdrop_path": m.get("backdrop_path"),
        "release_date": m.get("release_date") or m.get("first_air_date") or "",
        "vote_average": round(float(m.get("vote_average") or 0), 1),
        "genre_ids": m.get("genre_ids", []),
        "popularity": m.get("popularity", 0)
    }

async def movie_pool(pages=3):
    datas = await asyncio.gather(*[
        tmdb("/movie/popular", {"language": "en-US", "page": p, "region": "US"})
        for p in range(1, pages + 1)
    ])
    movies = [normalize_movie(x) for d in datas for x in d.get("results", [])]
    # de-duplicate and ignore empty plots
    seen, out = set(), []
    for m in movies:
        if m["id"] not in seen and m["overview"].strip():
            seen.add(m["id"])
            out.append(m)
    return out

@app.get("/api/health")
async def health():
    return {"ok": True, "tmdb_configured": bool(TMDB_KEY)}

TMDB_PAGE = 20  # TMDB always returns 20 movies per page

async def paged(path: str, extra: dict, page: int, limit: int):
    """Fetch enough TMDB pages to cover `limit` movies, then slice the exact window."""
    start = (page - 1) * limit
    first = start // TMDB_PAGE + 1
    last = min((start + limit - 1) // TMDB_PAGE + 1, 500)
    if first > 500:
        return []
    datas = await asyncio.gather(*[
        tmdb(path, {"language": "en-US", "page": p, **extra})
        for p in range(first, last + 1)
    ])
    items = [x for d in datas for x in d.get("results", [])]
    offset = start - (first - 1) * TMDB_PAGE
    return [normalize_movie(x) for x in items[offset:offset + limit]]

@app.get("/api/movies/{category}")
async def category(
    category: str,
    page: int = Query(1, ge=1, le=100),
    limit: int = Query(20, ge=1, le=60),
):
    endpoints = {
        "trending": ("/trending/movie/week", {}),
        "popular": ("/movie/popular", {"region": "US"}),
        "top-rated": ("/movie/top_rated", {"region": "US"}),
        "now-playing": ("/movie/now_playing", {"region": "US"}),
        "upcoming": ("/movie/upcoming", {"region": "US"}),
    }
    if category not in endpoints:
        raise HTTPException(404, "Unknown category")
    path, extra = endpoints[category]
    return {"results": await paged(path, extra, page, limit)}

# Industry filters: Bollywood = Hindi, Hollywood = English (US), South = Tamil/Telugu/Malayalam/Kannada
ORIGINS = {
    "bollywood": {"with_original_language": "hi"},
    "hollywood": {"with_original_language": "en", "with_origin_country": "US"},
    # Tamil | Telugu | Malayalam | Kannada ("|" means OR in TMDB filters)
    "south": {"with_original_language": "ta|te|ml|kn"},
}

@app.get("/api/discover")
async def discover(
    origin: str = Query(...),
    genre: int = Query(0, ge=0),
    page: int = Query(1, ge=1, le=100),
    limit: int = Query(20, ge=1, le=60),
):
    if origin not in ORIGINS:
        raise HTTPException(404, "Unknown origin")
    extra = {
        **ORIGINS[origin],
        "sort_by": "popularity.desc",
        "include_adult": "false",
        "vote_count.gte": 30,
    }
    if genre:
        extra["with_genres"] = str(genre)
    return {"results": await paged("/discover/movie", extra, page, limit)}

@app.get("/api/search")
async def search(q: str = Query(..., min_length=1)):
    data = await tmdb("/search/movie", {"query": q, "language": "en-US", "include_adult": "false", "page": 1})
    return {"results": [normalize_movie(x) for x in data.get("results", [])]}

@app.get("/api/movie/{movie_id}")
async def movie_detail(movie_id: int):
    data = await tmdb(f"/movie/{movie_id}", {"language": "en-US"})
    return normalize_movie(data) | {
        "genres": [{"id": g["id"], "name": g["name"]} for g in data.get("genres", [])],
        "runtime": data.get("runtime"),
        "tagline": data.get("tagline") or "",
        "status": data.get("status"),
        "homepage": data.get("homepage") or ""
    }

@app.get("/api/movie/{movie_id}/tfidf")
async def tfidf_recommendations(movie_id: int, limit: int = Query(8, ge=1, le=20)):
    target = await tmdb(f"/movie/{movie_id}", {"language": "en-US"})
    target_text = (target.get("title") or "") + " " + (target.get("overview") or "")
    if not target_text.strip():
        return {"results": []}

    pool = await movie_pool(5)
    pool = [m for m in pool if m["id"] != movie_id]
    docs = [m["overview"] for m in pool] + [target.get("overview") or ""]
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=1)
    matrix = vectorizer.fit_transform(docs)
    scores = cosine_similarity(matrix[-1], matrix[:-1]).ravel()

    ranked = sorted(zip(pool, scores), key=lambda x: x[1], reverse=True)[:limit]
    results = []
    for m, score in ranked:
        results.append(m | {"similarity": round(float(score), 4)})
    return {"results": results}

@app.get("/api/movie/{movie_id}/genre")
async def genre_recommendations(movie_id: int, limit: int = Query(8, ge=1, le=20)):
    target = await tmdb(f"/movie/{movie_id}", {"language": "en-US"})
    genre_ids = [g["id"] for g in target.get("genres", [])]
    if not genre_ids:
        return {"results": []}
    data = await tmdb("/discover/movie", {
        "language": "en-US",
        "sort_by": "popularity.desc",
        "with_genres": "|".join(map(str, genre_ids[:2])),
        "include_adult": "false",
        "page": 1
    })
    results = [normalize_movie(x) for x in data.get("results", []) if x.get("id") != movie_id]
    return {"results": results[:limit]}

@app.get("/api/movie/{movie_id}/providers")
async def watch_providers(movie_id: int, region: str = Query("IN", min_length=2, max_length=2)):
    """Where a movie can legally be watched (data from TMDB, powered by JustWatch)."""
    data = await tmdb(f"/movie/{movie_id}/watch/providers")
    info = (data.get("results") or {}).get(region.upper(), {})

    def pack(items):
        return [
            {"id": p.get("provider_id"), "name": p.get("provider_name", ""), "logo": p.get("logo_path")}
            for p in (items or [])
        ]

    return {
        "region": region.upper(),
        "link": info.get("link", ""),
        "flatrate": pack(info.get("flatrate")),
        "free": pack(info.get("free")),
        "ads": pack(info.get("ads")),
        "rent": pack(info.get("rent")),
        "buy": pack(info.get("buy")),
    }

@app.get("/api/share/{movie_id}", response_class=HTMLResponse)
async def share_page(movie_id: int):
    """Link people share. Chat apps read the preview tags (poster, title, plot);
    real visitors are redirected straight to that movie inside the site."""
    m = await tmdb(f"/movie/{movie_id}", {"language": "en-US"})
    title = m.get("title") or "Movie"
    year = (m.get("release_date") or "")[:4]
    full_title = f"{title} ({year})" if year else title
    plot = (m.get("overview") or "Find movies you will love on AltrexPicks.").strip()
    if len(plot) > 200:
        plot = plot[:197].rstrip() + "..."
    if m.get("backdrop_path"):
        image, card = f"https://image.tmdb.org/t/p/w780{m['backdrop_path']}", "summary_large_image"
    elif m.get("poster_path"):
        image, card = f"https://image.tmdb.org/t/p/w500{m['poster_path']}", "summary"
    else:
        image, card = "", "summary"
    dest = f"/?movie={movie_id}"
    t, d = escape(full_title + " - AltrexPicks"), escape(plot)
    img_tags = f'<meta property="og:image" content="{escape(image)}"><meta name="twitter:image" content="{escape(image)}">' if image else ""
    return HTMLResponse(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>{t}</title>
<meta name="description" content="{d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AltrexPicks">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta name="twitter:card" content="{card}">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
{img_tags}
<meta http-equiv="refresh" content="0;url={dest}">
</head><body><script>location.replace("{dest}")</script>
<p><a href="{dest}">Open {escape(title)} on AltrexPicks</a></p></body></html>""")

@app.get("/")
async def home():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/{path:path}")
async def static_files(path: str):
    candidate = STATIC_DIR / path
    if candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(STATIC_DIR / "index.html")