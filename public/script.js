// ===================== STATE =====================
let currentFeed = "trending";
let currentPage = 1;
let totalPages = 1;
let searchDebounceTimer = null;

const IMG_BASE = "https://image.tmdb.org/t/p";

const FEED_LABELS = {
  trending: "🔥 Trending Now",
  popular: "📈 Popular Movies",
  top_rated: "🏅 Top Rated Movies",
  now_playing: "▶️ Now Playing",
  upcoming: "📅 Upcoming Releases",
  favorites: "❤️ My Favorites",
};

// ===================== DOM =====================
const movieGrid = document.getElementById("movieGrid");
const feedTitle = document.getElementById("feedTitle");
const feedCount = document.getElementById("feedCount");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const movieModal = document.getElementById("movieModal");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");

// ===================== HELPERS =====================
function posterUrl(path, size = "w342"){
  return path ? `${IMG_BASE}/${size}${path}` : "https://placehold.co/342x513/17171c/6a6873?text=No+Poster";
}
function yearOf(dateStr){ return dateStr ? dateStr.slice(0, 4) : "—"; }
function escapeHTML(str = ""){
  return str.replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

// ===================== FAVORITES (saved in this browser) =====================
const FAV_KEY = "wtw_favorites";
const movieCache = new Map();

function slimMovie(m){
  return {
    id: m.id,
    title: m.title,
    poster_path: m.poster_path,
    vote_average: m.vote_average,
    release_date: m.release_date,
  };
}
function getFavorites(){
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
  catch { return []; }
}
function saveFavorites(list){
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch {}
}
function isFavorite(id){
  return getFavorites().some(m => String(m.id) === String(id));
}
// returns true if the movie is now a favorite, false if it was removed
function toggleFavorite(movie){
  const list = getFavorites();
  const idx = list.findIndex(m => String(m.id) === String(movie.id));
  let nowFav;
  if (idx >= 0){ list.splice(idx, 1); nowFav = false; }
  else { list.unshift(slimMovie(movie)); nowFav = true; }
  saveFavorites(list);
  updateFavCount();
  syncHearts();
  showToast(nowFav ? "❤️ Added to favorites" : "Removed from favorites");
  return nowFav;
}
function updateFavCount(){
  const el = document.getElementById("favCount");
  if (el) el.textContent = getFavorites().length;
}
function syncHearts(){
  document.querySelectorAll(".fav-btn").forEach(btn => {
    btn.classList.toggle("active", isFavorite(btn.dataset.id));
  });
}
function renderModalFavBtn(){
  const btn = document.getElementById("modalFavBtn");
  if (!btn) return;
  const fav = isFavorite(btn.dataset.id);
  btn.classList.toggle("active", fav);
  btn.textContent = fav ? "♥ In Favorites" : "♡ Add to Favorites";
}
let toastTimer = null;
function showToast(msg){
  let t = document.getElementById("toast");
  if (!t){
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

function renderFavorites(){
  const favs = getFavorites();
  feedCount.textContent = `— ${favs.length} saved`;
  loadMoreBtn.parentElement.classList.add("hidden");
  if (favs.length === 0){
    movieGrid.innerHTML = `<div class="empty-state">💔 Abhi koi favorite nahi hai.<br>Kisi bhi movie card pe ❤️ dabao, wo yahan save ho jayegi.</div>`;
    return;
  }
  movieGrid.innerHTML = favs.map(movieCardHTML).join("");
}

async function apiGet(path){
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// ===================== RENDER: GRID =====================
function renderSkeletons(count = 10){
  movieGrid.innerHTML = "";
  for (let i = 0; i < count; i++){
    const sk = document.createElement("div");
    sk.className = "skeleton";
    movieGrid.appendChild(sk);
  }
}

function movieCardHTML(movie){
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";
  const fav = isFavorite(movie.id);
  movieCache.set(String(movie.id), slimMovie(movie));
  return `
    <div class="movie-card" data-id="${movie.id}">
      <div class="poster-wrap">
        <img loading="lazy" src="${posterUrl(movie.poster_path)}" alt="${escapeHTML(movie.title)}">
        <button class="fav-btn ${fav ? "active" : ""}" data-id="${movie.id}" aria-label="Toggle favorite" title="Add to favorites">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2 0 3.6 1.1 4.6 2.7h2c1-1.6 2.6-2.7 4.6-2.7 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z" stroke-width="2" stroke-linejoin="round"/></svg>
        </button>
        <span class="rating-badge">⭐ ${rating}</span>
      </div>
      <div class="card-info">
        <div class="card-title">${escapeHTML(movie.title)}</div>
        <div class="card-meta">${yearOf(movie.release_date)}</div>
      </div>
    </div>`;
}

// One delegated listener for the whole grid (heart button + card click)
movieGrid.addEventListener("click", (e) => {
  const heart = e.target.closest(".fav-btn");
  if (heart){
    e.stopPropagation();
    const movie = movieCache.get(String(heart.dataset.id));
    if (!movie) return;
    toggleFavorite(movie);
    if (currentFeed === "favorites") renderFavorites();
    return;
  }
  const card = e.target.closest(".movie-card");
  if (card) openMovieModal(card.dataset.id);
});

// ===================== LOAD FEED =====================
async function loadFeed(feed, page = 1){
  currentFeed = feed;
  currentPage = page;
  feedTitle.textContent = FEED_LABELS[feed];
  if (feed === "favorites"){ renderFavorites(); return; }
  if (page === 1) renderSkeletons();

  try{
    const data = await apiGet(`/api/feed/${feed}?page=${page}`);
    totalPages = data.total_pages;
    feedCount.textContent = `— ${data.total_results?.toLocaleString() || 0} movies`;

    if (page === 1) movieGrid.innerHTML = "";
    if (!data.results || data.results.length === 0){
      movieGrid.innerHTML = `<div class="empty-state">No movies found for this feed.</div>`;
      loadMoreBtn.parentElement.classList.add("hidden");
      return;
    }
    movieGrid.insertAdjacentHTML("beforeend", data.results.map(movieCardHTML).join(""));
    loadMoreBtn.parentElement.classList.toggle("hidden", currentPage >= totalPages);
  } catch(err){
    console.error(err);
    movieGrid.innerHTML = `<div class="empty-state">Couldn't load movies. Is the server running?</div>`;
  }
}

loadMoreBtn.addEventListener("click", () => {
  if (currentPage < totalPages) loadFeed(currentFeed, currentPage + 1);
});

// ===================== TABS / NAV =====================
document.querySelectorAll(".tab-pill, .nav-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    const feed = btn.dataset.feed;
    document.querySelectorAll(".tab-pill").forEach(b => b.classList.toggle("active", b.dataset.feed === feed));
    document.querySelectorAll(".nav-pill").forEach(b => b.classList.toggle("active", b.dataset.feed === feed));
    loadFeed(feed, 1);
    document.getElementById("feedSection").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.getElementById("exploreBtn").addEventListener("click", () => {
  document.getElementById("feedSection").scrollIntoView({ behavior: "smooth" });
});

// ===================== SURPRISE ME =====================
document.getElementById("surpriseBtn").addEventListener("click", async () => {
  try{
    const randomPage = Math.floor(Math.random() * 20) + 1;
    const data = await apiGet(`/api/feed/popular?page=${randomPage}`);
    const pick = data.results[Math.floor(Math.random() * data.results.length)];
    openMovieModal(pick.id);
  } catch(err){ console.error(err); }
});

// ===================== SEARCH =====================
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  const q = searchInput.value.trim();
  if (!q){
    searchResults.classList.remove("show");
    return;
  }
  searchDebounceTimer = setTimeout(() => runSearch(q), 350);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) searchResults.classList.remove("show");
});

async function runSearch(query){
  try{
    const data = await apiGet(`/api/search?query=${encodeURIComponent(query)}`);
    searchResults.classList.add("show");
    if (!data.results || data.results.length === 0){
      searchResults.innerHTML = `<div class="search-empty">No movies match "${escapeHTML(query)}"</div>`;
      return;
    }
    searchResults.innerHTML = data.results.slice(0, 8).map(m => `
      <div class="search-row" data-id="${m.id}">
        <img src="${posterUrl(m.poster_path, "w92")}" alt="">
        <div>
          <div class="sr-title">${escapeHTML(m.title)}</div>
          <div class="sr-year">${yearOf(m.release_date)}</div>
        </div>
      </div>`).join("");
    searchResults.querySelectorAll(".search-row").forEach(row => {
      row.addEventListener("click", () => {
        openMovieModal(row.dataset.id);
        searchResults.classList.remove("show");
        searchInput.value = "";
      });
    });
  } catch(err){ console.error(err); }
}

// ===================== MOVIE MODAL =====================
async function openMovieModal(id){
  movieModal.classList.remove("hidden");
  modalBody.innerHTML = `<div style="padding:60px;text-align:center;color:#a3a1ab;">Loading…</div>`;
  document.body.style.overflow = "hidden";

  try{
    const { details, credits, recommendations } = await apiGet(`/api/movie/${id}`);
    const cast = (credits.cast || []).slice(0, 8);
    const similar = (recommendations.results || []).slice(0, 6);
    const backdrop = details.backdrop_path ? posterUrl(details.backdrop_path, "w1280") : posterUrl(details.poster_path, "w780");

    modalBody.innerHTML = `
      <div class="modal-hero" style="background-image:url('${backdrop}')"></div>
      <div class="modal-content">
        <div class="modal-flex">
          <img class="modal-poster" src="${posterUrl(details.poster_path)}" alt="${escapeHTML(details.title)}">
          <div>
            <div class="modal-title">${escapeHTML(details.title)}</div>
            ${details.tagline ? `<div class="modal-tagline">"${escapeHTML(details.tagline)}"</div>` : ""}
            <div class="modal-badges">
              <span class="badge gold">⭐ ${details.vote_average?.toFixed(1) ?? "N/A"} (${details.vote_count?.toLocaleString() ?? 0})</span>
              <span class="badge">${yearOf(details.release_date)}</span>
              ${details.runtime ? `<span class="badge">${details.runtime} min</span>` : ""}
              ${(details.genres || []).map(g => `<span class="badge">${escapeHTML(g.name)}</span>`).join("")}
            </div>
            <button id="modalFavBtn" class="fav-modal-btn" data-id="${details.id}"></button>
          </div>
        </div>

        <div class="modal-section-title">Overview</div>
        <p class="modal-overview">${escapeHTML(details.overview || "No overview available.")}</p>

        ${cast.length ? `
        <div class="modal-section-title">Top Cast</div>
        <div class="cast-row">
          ${cast.map(c => `
            <div class="cast-chip">
              <img src="${c.profile_path ? posterUrl(c.profile_path, "w185") : "https://placehold.co/84x84/17171c/6a6873?text=?"}" alt="">
              <div class="cn">${escapeHTML(c.name)}</div>
              <div class="cr">${escapeHTML(c.character || "")}</div>
            </div>`).join("")}
        </div>` : ""}

        ${similar.length ? `
        <div class="modal-section-title">More Like This</div>
        <div class="similar-grid">
          ${similar.map(s => `
            <div class="similar-card" data-id="${s.id}">
              <img src="${posterUrl(s.poster_path, "w185")}" alt="">
              <div class="st">${escapeHTML(s.title)}</div>
            </div>`).join("")}
        </div>` : ""}
      </div>`;

    modalBody.querySelectorAll(".similar-card").forEach(card => {
      card.addEventListener("click", () => openMovieModal(card.dataset.id));
    });

    renderModalFavBtn();
    document.getElementById("modalFavBtn").addEventListener("click", () => {
      toggleFavorite(details);
      renderModalFavBtn();
      if (currentFeed === "favorites") renderFavorites();
    });
  } catch(err){
    console.error(err);
    modalBody.innerHTML = `<div style="padding:60px;text-align:center;color:#a3a1ab;">Couldn't load movie details.</div>`;
  }
}

function closeModal(){
  movieModal.classList.add("hidden");
  document.body.style.overflow = "";
}
modalClose.addEventListener("click", closeModal);
movieModal.addEventListener("click", (e) => { if (e.target === movieModal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ===================== INIT =====================
updateFavCount();
loadFeed(currentFeed, 1);