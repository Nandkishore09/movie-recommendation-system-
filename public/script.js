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
  return `
    <div class="movie-card" data-id="${movie.id}">
      <div class="poster-wrap">
        <img loading="lazy" src="${posterUrl(movie.poster_path)}" alt="${escapeHTML(movie.title)}">
        <span class="rating-badge">⭐ ${rating}</span>
      </div>
      <div class="card-info">
        <div class="card-title">${escapeHTML(movie.title)}</div>
        <div class="card-meta">${yearOf(movie.release_date)}</div>
      </div>
    </div>`;
}

function attachCardListeners(){
  movieGrid.querySelectorAll(".movie-card").forEach(card => {
    card.addEventListener("click", () => openMovieModal(card.dataset.id));
  });
}

// ===================== LOAD FEED =====================
async function loadFeed(feed, page = 1){
  currentFeed = feed;
  currentPage = page;
  feedTitle.textContent = FEED_LABELS[feed];
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
    attachCardListeners();
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
loadFeed(currentFeed, 1);
