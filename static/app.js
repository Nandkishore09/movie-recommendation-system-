const API="/api";
const $=s=>document.querySelector(s);
const poster=p=>p?`https://image.tmdb.org/t/p/w500${p}`:"https://placehold.co/500x750/101c31/eaf2fb?text=No+Poster";
const backdrop=p=>p?`https://image.tmdb.org/t/p/w1280${p}`:"";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const NAMES={"trending":"Trending now","popular":"Popular movies","top-rated":"Top rated","now-playing":"Now playing","upcoming":"Upcoming","mylist":"My list"};
const GENRE_CHIPS=[["All",0],["Action",28],["Comedy",35],["Drama",18],["Thriller",53],["Horror",27],["Romance",10749],["Sci-Fi",878],["Animation",16],["Crime",80],["Fantasy",14]];

let cat="trending",page=1,mode="cat",lastQuery="",shown=[],genre=0,origin="";
const reg={};            // id -> movie, so hearts can save full movie data
let list=[];
try{list=JSON.parse(localStorage.getItem("altrex_list")||"[]")}catch{}

async function getJSON(url){
  const r=await fetch(url);
  if(!r.ok) throw new Error(r.status);
  return r.json();
}
function toast(msg){
  const t=$("#toast");t.textContent=msg;t.classList.add("show");
  clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200);
}
const inList=id=>list.some(m=>m.id===id);
function updateCount(){$("#list-count").textContent=list.length}
function toggleList(e,id){
  e.stopPropagation();
  if(inList(id)){list=list.filter(m=>m.id!==id);toast("Removed from My list")}
  else if(reg[id]){list.push(reg[id]);toast("Added to My list")}
  try{localStorage.setItem("altrex_list",JSON.stringify(list))}catch{}
  document.querySelectorAll(`[data-heart="${id}"]`).forEach(b=>b.classList.toggle("on",inList(id)));
  updateCount();
  if(cat==="mylist"&&$("#modal").classList.contains("hidden")) loadCategory("mylist");
}

/* rating ring: 0-10 score shown as a circular progress */
function ring(v){
  const n=Number(v)||0;
  const cls=n>=7?"":n>=5?"mid":"low";
  return `<span class="ring ${cls}" style="--p:${Math.round(n*10)}" title="Rating ${n||"n/a"} out of 10"><i>${n?n.toFixed(1):"–"}</i></span>`;
}

function card(m,sim){
  reg[m.id]=m;
  const on=inList(m.id);
  return `<article class="card" tabindex="0" onclick="openMovie(${m.id})" onkeydown="if(event.key==='Enter')openMovie(${m.id})">
    <div class="poster"><img loading="lazy" src="${poster(m.poster_path)}" alt="${esc(m.title)} poster">
      <button class="heart ${on?"on":""}" data-heart="${m.id}" aria-label="Add to My list" onclick="toggleList(event,${m.id})">♥</button>
      ${sim!=null?`<span class="match">${sim}% match</span>`:""}
      ${m.overview?`<div class="peek"><p>${esc(m.overview)}</p></div>`:""}
    </div>
    <div class="card-info">
      <div class="card-title">${esc(m.title)}<div class="year">${(m.release_date||"").slice(0,4)||"TBA"}</div></div>
      ${ring(m.vote_average)}
    </div>
  </article>`;
}
const skeletons=n=>Array(n).fill('<div class="skel"></div>').join("");

/* hero poster collage, filled from the first trending load */
function fillCollage(movies){
  const picks=movies.filter(m=>m.poster_path).slice(0,4);
  if(picks.length<4) return;
  $("#collage").innerHTML=picks.map(m=>`<button class="cp" aria-label="Open ${esc(m.title)}" onclick="openMovie(${m.id})"><img src="${poster(m.poster_path)}" alt="${esc(m.title)} poster"></button>`).join("");
}

/* industry buttons (Hollywood / Bollywood) + genre chips */
const ORIGIN_BTNS=[["Hollywood","hollywood"],["Bollywood","bollywood"],["South Indian","south"]];
const ORIGIN_TITLES={hollywood:"Hollywood movies",bollywood:"Bollywood movies",south:"South Indian movies"};
const genreName=id=>(GENRE_CHIPS.find(g=>g[1]===id)||[""])[0];
function drawGenres(){
  $("#genres").innerHTML=
    ORIGIN_BTNS.map(([n,o])=>`<button class="genre industry ${o===origin?"active":""}" onclick="toggleOrigin('${o}')">${n}</button>`).join("")+
    '<span class="gdiv" aria-hidden="true"></span>'+
    GENRE_CHIPS.map(([n,id])=>`<button class="genre ${id===genre?"active":""}" onclick="setGenre(${id})">${n}</button>`).join("");
}
function setGenre(id){
  genre=id;drawGenres();
  if(origin) loadOrigin(origin); else paint();
}
function toggleOrigin(o){
  if(origin===o) loadCategory(cat); else loadOrigin(o);
}
function resetGenre(){
  if(genre||origin){genre=0;origin="";drawGenres()}
}

function paint(){
  const items=(genre&&!origin)?shown.filter(m=>(m.genre_ids||[]).includes(genre)):shown;
  let msg='No movies found. Try a different title.';
  if(cat==="mylist"&&mode==="cat"&&!origin) msg='Your list is empty. Tap ♥ on any movie to save it here.';
  else if(origin) msg='No movies found for this filter. Try another genre.';
  else if(genre&&shown.length) msg='No movies in this genre on this page. Pick another genre or load more.';
  $("#grid").innerHTML=items.length?items.map(m=>card(m)).join(""):`<p class="empty">${msg}</p>`;
}

const PAGE_SIZE=50;
const REGION="IN";   // country code used for "Where to watch"
function render(movies,append){
  const got=movies.length;
  if(append){
    const ids=new Set(shown.map(m=>m.id));
    movies=movies.filter(m=>!ids.has(m.id));
  }
  shown=append?shown.concat(movies):movies;
  paint();
  $("#more").classList.toggle("hidden",!(got>=40&&cat!=="mylist"));
}

async function loadCategory(c,append=false){
  closeModal();
  if(!append){cat=c;mode="cat";page=1;$("#search").value="";resetGenre();}
  $("#section-title").textContent=NAMES[c];
  document.querySelectorAll("[data-cat]").forEach(b=>b.classList.toggle("active",b.dataset.cat===c));
  if(c==="mylist"){
    shown=list;paint();
    $("#more").classList.add("hidden");return;
  }
  if(!append) $("#grid").innerHTML=skeletons(12);
  try{
    const d=await getJSON(`${API}/movies/${c}?page=${page}&limit=${PAGE_SIZE}`);
    const results=d.results||[];
    if(c==="trending"&&!append) fillCollage(results);
    render(results,append);
  }catch{
    $("#grid").innerHTML='<p class="empty">Could not load movies. Check that your TMDB_API_KEY is set and the server is running.</p>';
  }
}

async function loadOrigin(o,append=false){
  closeModal();
  if(!append){
    origin=o;mode="origin";page=1;$("#search").value="";
    if(cat==="mylist") cat="trending";
    drawGenres();
  }
  const label=ORIGIN_TITLES[o]||"Movies";
  $("#section-title").textContent=genre?`${label} · ${genreName(genre)}`:label;
  document.querySelectorAll("[data-cat]").forEach(b=>b.classList.remove("active"));
  if(!append) $("#grid").innerHTML=skeletons(12);
  try{
    const d=await getJSON(`${API}/discover?origin=${o}&genre=${genre}&page=${page}&limit=${PAGE_SIZE}`);
    render(d.results||[],append);
  }catch{
    $("#grid").innerHTML='<p class="empty">Could not load movies. Check your connection and try again.</p>';
  }
}

async function search(q,append=false){
  q=q.trim();if(!q)return loadCategory(cat);
  if(!append){mode="search";lastQuery=q;page=1;resetGenre();$("#grid").innerHTML=skeletons(12);}
  $("#section-title").textContent=`Results for “${q}”`;
  document.querySelectorAll("[data-cat]").forEach(b=>b.classList.remove("active"));
  try{
    const d=await getJSON(`${API}/search?q=${encodeURIComponent(q)}`);
    render(d.results||[],false);$("#more").classList.add("hidden");
  }catch{$("#grid").innerHTML='<p class="empty">Search failed. Check your connection and try again.</p>'}
}

/* where to watch (TMDB watch providers, data by JustWatch) */
const logo=p=>`https://image.tmdb.org/t/p/w92${p}`;
function watchHTML(w){
  if(!w) return '<p class="watch-note">Could not load streaming info right now.</p>';
  const seen=new Set();
  const free=[...(w.free||[]),...(w.ads||[])].filter(p=>!seen.has(p.id)&&seen.add(p.id));
  const groups=[["Stream",w.flatrate],["Free",free],["Rent",w.rent],["Buy",w.buy]].filter(g=>g[1]&&g[1].length);
  if(!groups.length) return '<p class="watch-note">Not available to stream, rent or buy in India right now.</p>';
  const href=esc(w.link||"#");
  return groups.map(([label,arr])=>`<div class="wg"><h4>${label}</h4><div class="wlogos">${
    arr.map(p=>`<a class="wp" href="${href}" target="_blank" rel="noopener noreferrer" title="${esc(p.name)}">${p.logo?`<img src="${logo(p.logo)}" alt="${esc(p.name)}" loading="lazy">`:""}<span>${esc(p.name)}</span></a>`).join("")
  }</div></div>`).join("")+'<p class="watch-note">Tap a service to see the full list on TMDB. Availability data by JustWatch.</p>';
}

/* share */
const shareInfo={};
function shareMovie(e,id){
  e.stopPropagation();
  const s=shareInfo[id];if(!s) return;
  if(navigator.share&&matchMedia("(pointer:coarse)").matches){
    navigator.share({title:s.title,text:s.text,url:s.url}).catch(()=>{});
    return;
  }
  const pop=$("#share-pop");if(pop) pop.classList.toggle("hidden");
}
async function copyLink(id){
  const s=shareInfo[id];if(!s) return;
  try{await navigator.clipboard.writeText(s.url);toast("Link copied")}
  catch{window.prompt("Copy this link:",s.url)}
}
document.addEventListener("click",e=>{
  const pop=$("#share-pop");
  if(pop&&!pop.classList.contains("hidden")&&!e.target.closest(".share-wrap")) pop.classList.add("hidden");
});

/* detail modal */
function closeModal(){
  $("#modal").classList.add("hidden");document.body.style.overflow="";
  if(location.search.includes("movie=")) history.replaceState(null,"",location.pathname);
}
async function openMovie(id){
  $("#modal").classList.remove("hidden");document.body.style.overflow="hidden";
  $("#modal").scrollTop=0;
  $("#detail-content").innerHTML='<div class="d-body" style="padding-top:80px"><div class="skel" style="aspect-ratio:3/1"></div></div>';
  try{
    const [a,b,c,w]=await Promise.all([
      getJSON(`${API}/movie/${id}`),
      getJSON(`${API}/movie/${id}/tfidf?limit=10`),
      getJSON(`${API}/movie/${id}/genre?limit=10`),
      getJSON(`${API}/movie/${id}/providers?region=${REGION}`).catch(()=>null)
    ]);
    reg[a.id]=Object.assign({},a,{genre_ids:(a.genres||[]).map(g=>g.id)});
    const yr=(a.release_date||"").slice(0,4);
    const sUrl=`${location.origin}/api/share/${a.id}`;
    const sText=`🎬 ${a.title}${yr?` (${yr})`:""}${a.vote_average?` · ★ ${a.vote_average}/10`:""} — you should watch this! Found it on AltrexPicks.`;
    shareInfo[a.id]={title:a.title,text:sText,url:sUrl};
    const q=encodeURIComponent;
    const shareHTML=`<div class="share-wrap">
      <button class="secondary" onclick="shareMovie(event,${a.id})">Share</button>
      <div class="share-pop hidden" id="share-pop">
        <a href="https://wa.me/?text=${q(sText+" "+sUrl)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a href="https://t.me/share/url?url=${q(sUrl)}&text=${q(sText)}" target="_blank" rel="noopener noreferrer">Telegram</a>
        <a href="https://twitter.com/intent/tweet?text=${q(sText)}&url=${q(sUrl)}" target="_blank" rel="noopener noreferrer">X (Twitter)</a>
        <button type="button" onclick="copyLink(${a.id})">Copy link</button>
      </div></div>`;
    const chips=(a.genres||[]).map(g=>`<span class="chip">${esc(g.name)}</span>`).join("");
    const tf=b.results||[];
    const max=Math.max(...tf.map(m=>m.similarity||0),0.0001);
    const tfCards=tf.map(m=>card(m,Math.min(99,Math.round((m.similarity/max)*100)))).join("");
    $("#detail-content").innerHTML=`
      <div class="d-banner" style="background-image:url('${backdrop(a.backdrop_path)}')"></div>
      <div class="d-body">
        <div class="detail-hero">
          <img class="detail-poster" src="${poster(a.poster_path)}" alt="${esc(a.title)} poster">
          <div>
            <h2>${esc(a.title)} <span>(${(a.release_date||"").slice(0,4)})</span></h2>
            <div class="meta"><span class="gold">★ ${a.vote_average||"—"}</span>${a.runtime?`<span>${Math.floor(a.runtime/60)}h ${a.runtime%60}m</span>`:""}${a.status?`<span>${esc(a.status)}</span>`:""}</div>
            <div class="chips">${chips}</div>
            ${a.tagline?`<p class="tagline">${esc(a.tagline)}</p>`:""}
            <p class="overview">${esc(a.overview)||"No overview available."}</p>
            <div class="d-actions"><button class="primary" onclick="document.getElementById('watch-box').scrollIntoView({behavior:'smooth',block:'center'})">▶ Where to watch</button> <button class="secondary" data-heart="${a.id}" onclick="toggleList(event,${a.id});this.textContent=inList(${a.id})?'♥ In My list':'♡ Add to My list'">${inList(a.id)?"♥ In My list":"♡ Add to My list"}</button>${shareHTML}</div>
          </div>
        </div>
        <section class="rec-section" id="watch-box"><h3>Where to watch</h3>${watchHTML(w)}</section>
        ${tf.length?`<section class="rec-section"><h3>Similar plots</h3><div class="rec-row">${tfCards}</div></section>`:""}
        ${(c.results||[]).length?`<section class="rec-section"><h3>More in this genre</h3><div class="rec-row">${c.results.map(m=>card(m)).join("")}</div></section>`:""}
      </div>`;
  }catch{
    $("#detail-content").innerHTML='<div class="d-body" style="padding-top:80px"><p class="empty">Could not load this movie. Close this window and try again.</p></div>';
  }
}

/* events */
let timer;
$("#search").addEventListener("input",e=>{clearTimeout(timer);timer=setTimeout(()=>search(e.target.value),450)});
document.querySelectorAll("[data-cat]").forEach(b=>b.addEventListener("click",()=>loadCategory(b.dataset.cat)));
$("#more").onclick=()=>{page++;if(mode==="origin"&&origin) loadOrigin(origin,true); else loadCategory(cat,true)};
$("#explore").onclick=()=>{loadCategory("trending");$("#grid").scrollIntoView({behavior:"smooth"})};
$("#back").onclick=closeModal;
$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
$("#surprise").onclick=()=>{if(shown.length)openMovie(shown[Math.floor(Math.random()*shown.length)].id)};
const deepId=new URLSearchParams(location.search).get("movie");
drawGenres();updateCount();loadCategory("trending");
if(deepId&&/^\d+$/.test(deepId)) openMovie(Number(deepId));