# WhatToWatch (Backend version)

A movie discovery site where the TMDB API key stays safely on the **server**, not exposed in the browser.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create your `.env` file:
   - Copy `.env.example` and rename the copy to `.env`
   - Paste your TMDB API key into it:
     ```
     TMDB_API_KEY=your_real_key_here
     PORT=3000
     ```

3. Start the server:
   ```
   npm start
   ```

4. Open your browser at:
   ```
   http://localhost:3000
   ```

That's it — no popup, no key typed into the browser. The frontend calls your own
`/api/...` routes, and the server attaches the secret key when it talks to TMDB.

## Project structure

```
whattowatch-backend/
├── server.js          # Express server, proxies TMDB requests
├── package.json
├── .env.example        # copy → .env and add your real key
├── .gitignore           # keeps .env and node_modules out of git
└── public/
    ├── index.html
    ├── style.css
    └── script.js
```

## API routes (used by the frontend)

| Route | Description |
|---|---|
| `GET /api/feed/:feed?page=1` | `:feed` = trending, popular, top_rated, now_playing, upcoming |
| `GET /api/search?query=...` | Search movies by title |
| `GET /api/movie/:id` | Returns `{ details, credits, recommendations }` for one movie |

## Notes

- Never commit your `.env` file — it's already in `.gitignore`.
- If you deploy this (Render, Railway, etc.), set `TMDB_API_KEY` as an environment
  variable in your hosting dashboard instead of uploading the `.env` file.
