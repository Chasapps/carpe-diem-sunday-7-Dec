/* ================================================================================
APP LOGIC (v2.3) — CLEANED + FIXED
================================================================================
*/

const LS_KEYS = {
  VISITED:'harbour_pools_visited_v2_3',
  SELECTION:'harbour_pools_selected_v2_3',
  PASSPORT_PAGE:'harbour_pools_passport_page_v1'
};

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
let selectedIndex = Number(localStorage.getItem(LS_KEYS.SELECTION) || 0);

const listView = document.getElementById('listView');
const passportView = document.getElementById('passportView');
const toggleBtn = document.getElementById('toggleBtn');
const resetBtn = document.getElementById('resetBtn');
const countBadge = document.getElementById('countBadge');
const mapToggle = document.getElementById('mapToggle');

const prevPassportPageBtn = document.getElementById('prevPassportPage');
const nextPassportPageBtn = document.getElementById('nextPassportPage');

let currentPassportPage = Number(localStorage.getItem(LS_KEYS.PASSPORT_PAGE) || 0);
let onPassport = false;

function updateCount(){
  const n = Object.values(visited).filter(v => v && v.done).length;
  countBadge.textContent = `${n} / ${pools.length}`;
}

function setView(passport){
  onPassport = passport;
  document.body.classList.remove('full-map');
  listView.classList.toggle('active', !passport);
  passportView.classList.toggle('active', passport);
  toggleBtn.textContent = passport ? 'Back to List' : 'Passport';
  if (passport) renderPassport();
  setTimeout(()=> map.invalidateSize(), 150);
}

toggleBtn.addEventListener('click', () => setView(!onPassport));

resetBtn.addEventListener('click', () => {
  if (!confirm('Clear all stamps?')) return;
  visited = {};
  localStorage.setItem(LS_KEYS.VISITED, JSON.stringify(visited));
  renderList();
  renderPassport();
  updateCount();
});

mapToggle.addEventListener('click', () => {
  const fm = document.body.classList.toggle('full-map');
  mapToggle.textContent = fm ? '📋 Back to Split' : '🗺️ Full Map';
  mapToggle.setAttribute('aria-pressed', fm ? 'true' : 'false');
  setTimeout(() => { map.invalidateSize(); panToSelected(); }, 150);
});

const openNativeMapBtn = document.getElementById('openNativeMap');

function openInNativeMaps(){
  const p = pools[selectedIndex] || pools[0];
  if (!p) return;
  const lat = p.lat;
  const lng = p.lng;

  let url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  try {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)){
      url = `https://maps.apple.com/?q=${lat},${lng}`;
    }
  } catch (e) {}

  window.open(url, '_blank');
}

if (openNativeMapBtn){
  openNativeMapBtn.addEventListener('click', e => {
    e.preventDefault();
    openInNativeMaps();
  });
}

function renderList(){
  const list = document.getElementById('poolList');
  list.innerHTML = '';

  const p = pools[selectedIndex];
  const v = visited[p.name];
  const stamped = v && v.done;
  const stampDate = stamped && v.date ? v.date : null;

  const row = document.createElement('div');
  row.className = 'pool-item row-selected';

  row.innerHTML = `
    <div>
      <div class="pool-name">${p.name}</div>
      <div class="coords">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
    </div>
    <button class="stamp-chip ${stamped ? 'stamped' : ''}" data-name="${p.name}">
      ${stamped ? (stampDate ? `Stamped • ${stampDate}` : 'Stamped') : 'Not yet'}
    </button>
  `;

  row.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('stamp-chip')) return;
    panToSelected();
  });

  row.querySelector('.stamp-chip').addEventListener('click', (e) => {
    e.stopPropagation();
    const name = e.currentTarget.getAttribute('data-name');
    toggleStamp(name, true);
  });

  list.appendChild(row);
  updateCount();
}

function toggleStamp(name, animate = false){
  const existing = visited[name];
  const now = new Date().toISOString().split('T')[0];

  if (existing && existing.done){
    visited[name] = { done: false, date: null };
  } else {
    visited[name] = { done: true, date: now };
  }

  localStorage.setItem(LS_KEYS.VISITED, JSON.stringify(visited));
  renderList();
  renderPassport(animate ? name : null);
}

function setStampDate(name, date){
  if (!date) return;
  const trimmed = date.trim();
  if (!trimmed) return;

  visited[name] = { done: true, date: trimmed };

  localStorage.setItem(LS_KEYS.VISITED, JSON.stringify(visited));
  renderList();
  renderPassport(name);
}

function selectIndex(idx){
  selectedIndex = (idx + pools.length) % pools.length;
  localStorage.setItem(LS_KEYS.SELECTION, String(selectedIndex));
  renderList();
  panToSelected();
}

function moveSelection(step){ selectIndex(selectedIndex + step); }

document.getElementById('btnUp').addEventListener('click', () => moveSelection(-1));
document.getElementById('btnDown').addEventListener('click', () => moveSelection(1));

if (prevPassportPageBtn){
  prevPassportPageBtn.addEventListener('click', () => changePassportPage(-1));
}
if (nextPassportPageBtn){
  nextPassportPageBtn.addEventListener('click', () => changePassportPage(1));
}

const map = L.map('map').setView([pools[0].lat, pools[0].lng], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

const marker = L.marker([pools[0].lat, pools[0].lng]).addTo(map);

function panToSelected(){
  const p = pools[selectedIndex];
  marker.setLatLng([p.lat, p.lng]).bindPopup(p.name);
  map.setView([p.lat, p.lng], 15, { animate: true });
}

function changePassportPage(delta){
  currentPassportPage += delta;
  renderPassport();
}

function renderPassport(popName = null){
  const grid = document.getElementById('passportGrid');
  if (!grid) return;

  const pageLabel = document.getElementById('passportPageLabel');
  const stampsPerPage = 3;
  const totalPages = Math.max(1, Math.ceil(pools.length / stampsPerPage));

  if (currentPassportPage < 0) currentPassportPage = 0;
  if (currentPassportPage > totalPages - 1) currentPassportPage = totalPages - 1;

  try {
    localStorage.setItem(LS_KEYS.PASSPORT_PAGE, String(currentPassportPage));
  } catch (e) {}

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
      <div class="stamp ${popName === p.name ? 'pop' : ''}"
           style="${stamped ? 'opacity:.98' : 'opacity:.45; filter:grayscale(1)'}">
        <img src="stamp.svg" alt="stamp">
        <div class="label">${stamped ? p.name.split(' ')[0].toUpperCase() : 'NOT STAMPED'}</div>
      </div>
      <div class="stamp-date">${stampDate || ''}</div>
    `;

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

  if (pageLabel){
    pageLabel.textContent = `Page ${currentPassportPage + 1} of ${totalPages}`;
  }

  if (prevPassportPageBtn){
    prevPassportPageBtn.disabled = (currentPassportPage === 0);
  }
  if (nextPassportPageBtn){
    nextPassportPageBtn.disabled = (currentPassportPage === totalPages - 1);
  }
}

function init(){
  renderList();
  selectIndex(selectedIndex);
  setTimeout(() => { map.invalidateSize(); panToSelected(); }, 150);
  setView(false);
  updateCount();
}

document.addEventListener('DOMContentLoaded', init);
