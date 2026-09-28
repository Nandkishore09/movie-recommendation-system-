require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

if (!TMDB_API_KEY) {
  console.error("\n❌ Missing TMDB_API_KEY.");
  console.error("   1. Copy .env.example to a new file named .env");
  console.error("   2. Paste your TMDB API key into it");
  console.error("   3. Restart the server (npm start)\n");
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Helper: call TMDB with the secret key attached server-side ----------
async function tmdb(endpoint, query = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "en-US");
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`TMDB request failed (${res.status}): ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---------- Feed routes ----------
const FEED_ROUTES = {
  trending: "/trending/movie/week",
  popular: "/movie/popular",
  top_rated: "/movie/top_rated",
  now_playing: "/movie/now_playing",
  upcoming: "/movie/upcoming",
};

app.get("/api/feed/:feed", async (req, res) => {
  const endpoint = FEED_ROUTES[req.params.feed];
  if (!endpoint) return res.status(400).json({ error: "Unknown feed" });
  try {
    const data = await tmdb(endpoint, { page: req.query.page || 1 });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------- Search ----------
app.get("/api/search", async (req, res) => {
  const query = req.query.query;
  if (!query) return res.status(400).json({ error: "Missing query parameter" });
  try {
    const data = await tmdb("/search/movie", { query, page: req.query.page || 1 });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------- Movie details (bundles details + credits + recommendations) ----------
app.get("/api/movie/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [details, credits, recommendations] = await Promise.all([
      tmdb(`/movie/${id}`),
      tmdb(`/movie/${id}/credits`),
      tmdb(`/movie/${id}/recommendations`),
    ]);
    res.json({ details, credits, recommendations });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------- Fallback: serve the frontend for any other route ----------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🎬 WhatToWatch running at http://localhost:${PORT}\n`);
  });
}

module.exports = app;