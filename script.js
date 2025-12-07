/*
================================================================================
APP LOGIC (v2.3)  *ULTRA-DETAILED ANNOTATED*
================================================================================
WHAT THIS FILE CONTROLS
- Data/state: the list of pools, which ones are stamped (visited), which row is selected.
- Persistence: saves "visited" and "selected index" to localStorage so your progress is
  kept between reloads or browser restarts on the same device.
- Rendering: builds the scrollable list and passport grid from JS templates.
- Mapping: initializes Leaflet, moves the marker, pans/zooms to selection.
- Interaction: buttons (up/down/toggle/reset), keyboard navigation, full-map mode.

BEGINNER REMINDERS
- localStorage values are *strings* → JSON.stringify/parse for objects.
- DOM event listeners: attach once on load; for repeated rows use e.currentTarget.
- Guard state updates with modulo arithmetic to keep indices safe.
- Re-rendering small lists is OK. Optimize later only if needed.

TIP: Read top → bottom; functions are grouped by purpose (count/view, list, stamps, map, passport, init).
================================================================================
*/
// v2.3 'Pretty' with animations and polished UI
// Stable keys for localStorage. Changing these strings will "reset" stored progress
// since the browser would then look up different keys.
const LS_KEYS = {
  VISITED:'harbour_pools_visited_v2_3',
  SELECTION:'harbour_pools_selected_v2_3',
  PASSPORT_PAGE:'harbour_pools_passport_page_v1'
};

// Canonical list of pools. This is our single source of truth for content.
// Adding/removing a pool here automatically affects both list and passport views.
const pools = [
  { name: "Parsley Bay Swimming Enclosure, Vaucluse", lat: -33.852746, lng: 151.278041},
  { name: "Nielsen Park – Shark Beach, Vaucluse", lat: -33.850846, lng: 151.268571},
  { name: "Watsons Bay Baths, Watsons Bay", lat: -33.844243, lng: 151.281703},
  { name: "Murray Rose Pool (Redleaf), Double Bay", lat: -33.872072, lng: 151.247724},
  { name: "Marrinawi Cove, Barangaroo", lat: -33.859000, lng: 151.199000},
  { name: "Maccallum Seawater Pool, Cremorne Point", lat: -33.845320, lng: 151.228080},
  { name: "Balmoral Baths, Mosman", lat: -33.825413, lng: 151.251602},
  { name: "Clifton Gardens (Chowder Bay) netted enclosure, Mosman", lat: -33.842110, lng: 151.247550},
  { name: "Northbridge Baths, Sailors Bay", lat: -33.806626, lng: 151.221141},
  { name: "Greenwich Baths, Greenwich", lat: -33.841520, lng: 151.182880},
  { name: "Little Manly Cove tidal/netted pool, Manly", lat: -33.806764, lng: 151.286668},
  { name: "Forty Baskets Beach netted enclosure, Balgowlah", lat: -33.802309, lng: 151.269516},
  { name: "Woolwich Baths (Lane Cove River)", lat: -33.840300, lng: 151.170200},
  { name: "Chiswick Baths (Parramatta River)", lat: -33.850000, lng: 151.140000},
  { name: "Dawn Fraser Baths, Balmain", lat: -33.856095, lng: 151.170644}
];

// 'visited' is a map: { [poolName]: { done: boolean, date: string|null } }.
// We default to an empty object when nothing is saved yet, and we normalize older boolean-only data.
let visited = JSON.parse(localStorage.getItem(LS_KEYS.VISITED) || '{}');

function normalizeVisitedMap(raw){
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const key in raw){
    const val = raw[key];
    if (typeof val === 'boolean'){
      result[key] = { done: !!val, date: null };
    } else if (val && typeof val === 'object'){
      result[key] = {
        done: !!val.done,
        date: val.date || null
      };
    }
  }
  return result;
}

visited = normalizeVisitedMap(visited);
// Selected row index. We coerce to a number. Note: we clamp later via modulo logic when selecting.
let selectedIndex = Number(localStorage.getItem(LS_KEYS.SELECTION) || 0);

// === DOM REFERENCES (cache once; re-use) ===
const listView = document.getElementById('listView');
const passportView = document.getElementById('passportView'); // Hidden by default until toggled
const toggleBtn = document.getElementById('toggleBtn');         // Switch between list and passport
const resetBtn = document.getElementById('resetBtn');           // Clear all stamps (with confirm)
const countBadge = document.getElementById('countBadge');       // Shows 'N / total'
const mapToggle = document.getElementById('mapToggle');         // Full map vs split view

// Passport pagination controls
const prevPassportPageBtn = document.getElementById('prevPassportPage');
const nextPassportPageBtn = document.getElementById('nextPassportPage');

// Track which page of stamps we're on (0-based index)
let currentPassportPage = Number(localStorage.getItem(LS_KEYS.PASSPORT_PAGE) || 0);

/**
 * updateCount() — Derives progress from data and writes it to the badge.
 * Pure read from 'visited'; no side-effects other than DOM text update.
 */
function updateCount(){
  const n = Object.values(visited).filter(v => v && v.done).length;
  countBadge.textContent = `${n} / ${pools.length}`;
}

// Track which view is currently shown; used to set proper button label and classes.
let onPassport = false;
/**
 * setView(passport: boolean) — Switch between list and passport views.
 * Also ensures we exit full-map mode when changing views (so state is consistent).
 * We also invalidate the map size after a short delay to let CSS finish transitions.
 */
function setView(passport){
  onPassport = passport;
    // Always exit full-map when switching views so the UI remains predictable.
  document.body.classList.remove('full-map');
  listView.classList.toggle('active', !passport);
  passportView.classList.toggle('active', passport);
    toggleBtn.textContent = passport ? 'Back to List' : 'Passport'; // accessible label reflects current action
  if(passport) renderPassport();
    // Leaflet needs a nudge after containers change size/visibility.
  setTimeout(()=>map.invalidateSize(), 150);
}
// Action: Toggle between views
 toggleBtn.addEventListener('click', ()=> setView(!onPassport));

// Action: Reset stamps with a guard confirmation to prevent accidental loss.
resetBtn.addEventListener('click', ()=>{
  if(!confirm('Clear all stamps?')) return;
    visited = {}; // Simply clear the map; renders will interpret falsy as 'not stamped'
  localStorage.setItem(LS_KEYS.VISITED, JSON.stringify(visited));
  renderList(); renderPassport(); updateCount();
});

// Full map toggle
// Action: Full map toggle. We store the state as a body class for CSS to consume.
mapToggle.addEventListener('click', ()=>{
  const fm = document.body.classList.toggle('full-map');
  mapToggle.textContent = fm ? '📋 Back to Split' : '🗺️ Full Map';
  mapToggle.setAttribute('aria-pressed', fm ? 'true' : 'false');
    // Invalidate map tile layout, then pan to ensure the selected marker is centered in the new layout.
  setTimeout(()=>{ map.invalidateSize(); panToSelected(); }, 150);
});


// Open currently selected pool in native mapping app
const openNativeMapBtn = document.getElementById('openNativeMap');

function openInNativeMaps(){
  const p = pools[selectedIndex] || pools[0];
  if(!p) return;
  const lat = p.lat;
  const lng = p.lng;

  // Default to Google Maps; prefer Apple Maps on iOS Safari
  let url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  try{
    const ua = navigator.userAgent || '';
    if(/iPad|iPhone|iPod/.test(ua)){
      url = `https://maps.apple.com/?q=${lat},${lng}`;
    }
  }catch(e){}

  window.open(url, '_blank');
}

if(openNativeMapBtn){
  openNativeMapBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    openInNativeMaps();
  });
}


/**
 * renderList() — Regenerates the list UI from the pools[] array and current 'visited' map.
 * For a small list this "rebuild each time" approach is simplest and very fast.
 * If you scale up to hundreds of rows, consider diffing/patching or virtualization.
 */
function renderList(){
  const list = document.getElementById('poolList');
  list.innerHTML = '';

  const p = pools[selectedIndex];

  const row = document.createElement('div');
  row.className = 'pool-item row-selected';

  const v = visited[p.name];
  const stamped = v && v.done;
  const stampDate = stamped && v.date ? v.date : null;

  row.innerHTML = `
    <div>
      <div class="pool-name">${p.name}</div>
      <div class="coords">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
    </div>
    <button class="stamp-chip ${stamped ? 'stamped':''}" 
      data-name="${p.name}">${stamped ? (stampDate ? 'Stamped • ${stampDate}' : 'Stamped') : 'Not yet'}</button>`;

  row.addEventListener('click', (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains('stamp-chip')) return;
    panToSelected();
  });

  row.querySelector('.stamp-chip').addEventListener('click', (e)=>{
    e.stopPropagation();
    const name = e.currentTarget.getAttribute('data-name');
    toggleStamp(name, true);
  });

  list.appendChild(row);
  updateCount();
}


/**
 * toggleStamp(name: string, animate = false)
 * - Flips the visited status for a given pool name.
 * - Persists to localStorage.
 * - Rerenders list + passport (optionally animating the affected stamp).
 */
function toggleStamp(name, animate=false){
  const existing = visited[name];
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (existing && existing.done){
    // Un-stamp: keep entry but mark as not done, clear date
    visited[name] = { done:false, date:null };


/**
 * setStampDate(name: string, date: string)
 * - Sets/updates the date for a stamped pool.
 */
function setStampDate(name, date){
  if (date == null || date === '') return;
  const trimmed = String(date).trim();
  const existing = visited[name];
  if (existing && existing.done){
    visited[name] = { done:true, date:trimmed };
  } else {
    // If it wasn't stamped yet, stamping it with the provided date.
    visited[name] = { done:true, date:trimmed };
  }
  localStorage.setItem(LS_KEYS.VISITED, JSON.stringify(visited));
  renderList();
  renderPassport(name);
}

  } else {
    // Stamp freshly: mark done with today's date
    visited[name] = { done:true, date:now };
  }

  localStorage.setItem(LS_KEYS.VISITED, JSON.stringify(visited));
  renderList();
  renderPassport(animate ? name : null); // pass the name so CSS can pop the changed stamp
}

/**
 * selectIndex(idx: number) — Safe selection with wrap-around via modulo.
 * Also persists to localStorage so selection survives reload.
 */
function selectIndex(idx){
  selectedIndex = (idx + pools.length) % pools.length;
  localStorage.setItem(LS_KEYS.SELECTION, String(selectedIndex));
  renderList();
  panToSelected();
}


/**
 * moveSelection(step: -1|+1) — convenience wrapper used by ▲/▼ buttons.
 */
function moveSelection(step){ selectIndex(selectedIndex + step); }
// Controls: ▲ moves up (previous row)
 document.getElementById('btnUp').addEventListener('click', ()=>moveSelection(-1));
// Controls: ▼ moves down (next row)
 document.getElementById('btnDown').addEventListener('click', ()=>moveSelection(1));

// Passport page navigation
if(prevPassportPageBtn){
  prevPassportPageBtn.addEventListener('click', ()=>{
    changePassportPage(-1);
  });
}

if(nextPassportPageBtn){
  nextPassportPageBtn.addEventListener('click', ()=>{
    changePassportPage(1);
  });
}


/**
 * highlightSelected() — Adds/removes .row-selected to visually mark the active row.
 * This is separate from selection so we can call it after re-render easily.
 */
function highlightSelected(){
  // Single-row layout now; selection styling handled in renderList.
}


// Map using Leaflet
// === MAP INITIALIZATION (Leaflet) ===
// Create a map bound to #map, set initial center to first pool with a sane zoom (14).
const map = L.map('map').setView([pools[0].lat, pools[0].lng], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map); // free OSM tiles
const marker = L.marker([pools[0].lat, pools[0].lng]).addTo(map); // one marker we move around (cheaper than re-creating)

/**
 * panToSelected() — move the marker and recenter the map on the current selection.
 * Also binds a small popup with the pool's name for context.
 */
function panToSelected(){
  const p = pools[selectedIndex];
  marker.setLatLng([p.lat, p.lng]).bindPopup(p.name);
    map.setView([p.lat, p.lng], 15, {animate:true}); // could switch to flyTo for smoother animation
}

/**
 * renderPassport(popName?: string)
 * - Rebuilds the grid of 'passport' cards from pools[] and current visited map.
 * - Each card includes a decorative SVG stamp; when not visited we desaturate it.
 * - If popName matches, add a temporary .pop class to micro-animate that stamp.
 */
/**
 * changePassportPage(delta: -1|+1)
 * - Moves the passport view forward/backward by one page.
 * - Uses renderPassport() to clamp and update UI.
 */
function changePassportPage(delta){
  currentPassportPage += delta;
  renderPassport();
}

function renderPassport(popName=null){
  const grid = document.getElementById('passportGrid');
  if(!grid) return;

  const pageLabel = document.getElementById('passportPageLabel');
  const stampsPerPage = 3;
  const totalPages = Math.max(1, Math.ceil(pools.length / stampsPerPage));

  // Clamp page to valid range
  if(currentPassportPage < 0) currentPassportPage = 0;
  if(currentPassportPage > totalPages - 1) currentPassportPage = totalPages - 1;

  // Persist page so returning later resumes where you left off
  try{
    localStorage.setItem(LS_KEYS.PASSPORT_PAGE, String(currentPassportPage));
  }catch(e){}

  // Compute which slice of pools belongs to this page
  const start = currentPassportPage * stampsPerPage;
  const pagePools = pools.slice(start, start + stampsPerPage);

  grid.innerHTML = '';

  pagePools.forEach(p => {
    const v = visited[p.name];
    const stamped = v && v.done;
    const stampDate = stamped && v.date ? v.date : null;

    const card = document.createElement('div');
    card.className = 'passport';
    card.innerHTML = `
      <div class="title">${p.name}</div>

      <div class="stamp ${popName===p.name?'pop':''}" style="${stamped?'opacity:.98':'opacity:.45; filter:grayscale(1)'}">
        <img src="stamp.svg" alt="stamp">
        <div class="label">${stamped ? p.name.split(' ')[0].toUpperCase() : 'NOT STAMPED'}</div>
      </div>
      <div class="stamp-date">${stamped && stampDate ? stampDate : ''}</div>`;

    const dateEl = card.querySelector('.stamp-date');
    if (dateEl){
      dateEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!stamped) return;
        const current = stampDate || '';
        const next = prompt('Edit visit date (YYYY-MM-DD):', current);
        if (!next) return;
        const trimmed = next.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)){
          alert('Please use YYYY-MM-DD format (e.g. 2025-12-05).');
          return;
        }
        setStampDate(p.name, trimmed);
      });
    }

    grid.appendChild(card);
  });

  // Update page label
  if(pageLabel){
    pageLabel.textContent = `Page ${currentPassportPage + 1} of ${totalPages}`;
  }

  // Enable/disable Nav buttons
  if(prevPassportPageBtn){
    prevPassportPageBtn.disabled = (currentPassportPage === 0);
  }
  if(nextPassportPageBtn){
    nextPassportPageBtn.disabled = (currentPassportPage === totalPages - 1);
  }
}

/**
 * init() — App entry point after DOM is ready. Sets up initial render and map.
 * Note the 150ms timeout: this is a pragmatic delay to allow CSS/layout to settle
 * before invalidating the map size (Leaflet reads container size on that call).
 */
function init(){
  renderList();
  selectIndex(selectedIndex);
  setTimeout(()=> { map.invalidateSize(); panToSelected(); }, 150);
  setView(false);
  updateCount();
}
// Defer initialization until DOMContentLoaded so all containers exist.
document.addEventListener('DOMContentLoaded', init);

/*
================================================================================
ULTRA KEY TAKEAWAYS (LOGIC)
1) Keep one source of truth (pools[] + visited + selectedIndex). Derive UI from it.
2) Write small, single-purpose functions (renderList, renderPassport, panToSelected).
3) Persist user intent early (localStorage) so accidental reloads don't lose progress.
4) Invalidate Leaflet after container changes (visibility/size) to avoid blank tiles.
5) Treat re-rendering small lists as acceptable. Optimize only when a profiler demands it.
6) Name things explicitly; comments explain *why*, not just *what*.
================================================================================
*/
