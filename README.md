<<<<<<< HEAD
# WhatToWatch  (Backend version)  
 
A movie discovery site where the TMDB API key stays safely on the **server**, not exposed in the browser.

## Complete Setup
=======
# WhatToWatch — full-stack movie recommendation clone

This is a from-scratch implementation inspired by the supplied WhatToWatch site. It is not the original source code.

## Stack
- Frontend: HTML, CSS, JavaScript
- Backend: FastAPI
- Movie data: TMDB API
- Recommendation: scikit-learn TF-IDF + cosine similarity
- Deployment: Vercel-compatible Python function
>>>>>>> 1d1ee6c (Update NEXORmovies branding and logo)

## 1. Get a TMDB API key
Create a TMDB account and generate an API key from the TMDB developer settings.

Create `.env` from `.env.example`:git add README.md
TMDB_API_KEY=YOUR_KEY

For Vercel, add `TMDB_API_KEY` as an Environment Variable in the project settings.

## 2. Run locally

Windows:
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn api.index:app --reload
```

Open:
http://127.0.0.1:8000

## 3. What the recommendation does

When a movie is opened, `/api/movie/{id}/tfidf`:
1. Gets the selected movie overview from TMDB.
2. Builds a corpus from several pages of popular movies.
3. Converts all overviews to TF-IDF vectors.
4. Calculates cosine similarity between the selected movie and every candidate.
5. Returns the highest-scoring candidates.

`/api/movie/{id}/genre` uses the selected movie's TMDB genre IDs to find genre matches.

## 4. Vercel

Push the folder to GitHub, import it into Vercel, and add:
TMDB_API_KEY = your key

The included `vercel.json` and `api/index.py` are intended for a Vercel Python deployment.

## Notes

The visual design and behavior are an original recreation based on the public page/screenshots. It does not claim to reproduce the site's private source code.
