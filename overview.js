// overview.js

// Same localStorage key as the main app so progress stays in sync.
const LS_VISITED_KEY = 'harbour_pools_visited_v2_3';

// Copy of the canonical pools list from script.js.
// Keep this in sync with the 'pools' array there.
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

const overviewPools = pools;

function loadVisitedMap() {
  try {
    const raw = localStorage.getItem(LS_VISITED_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) {
    console.warn('Error reading visited map for overview', e);
    return {};
  }
}

function countVisited(visitedMap) {
  return Object.values(visitedMap).filter(Boolean).length;
}

function updateOverviewText(visitedMap) {
  const badgeEl = document.getElementById('overviewBadge');
  const textEl  = document.getElementById('overviewText');

  const visitedCount = countVisited(visitedMap);
  const total = overviewPools.length;

  if (badgeEl) {
    badgeEl.textContent = `${visitedCount} / ${total}`;
  }

  if (textEl) {
    if (total === 0) {
      textEl.textContent = "No pools configured.";
    } else {
      textEl.textContent = `You’ve visited ${visitedCount} of ${total} harbour pools.`;
    }
  }
}

function createOverviewIcon(isVisited) {
  return L.divIcon({
    className: isVisited
      ? 'overview-marker overview-marker-visited'
      : 'overview-marker overview-marker-notvisited',
    html: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

function initOverviewMap() {
  const mapEl = document.getElementById('overviewMap');
  if (!mapEl) return;

  const visitedMap = loadVisitedMap();
  updateOverviewText(visitedMap);

  const map = L.map(mapEl, {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([-33.8688, 151.2093], 11); // Roughly Sydney CBD

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  const bounds = [];

  overviewPools.forEach(pool => {
    const isVisited = !!visitedMap[pool.name];
    const icon = createOverviewIcon(isVisited);
    const marker = L.marker([pool.lat, pool.lng], { icon }).addTo(map);

    marker.bindPopup(`<strong>${pool.name}</strong>`);

    bounds.push([pool.lat, pool.lng]);
  });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('openAppBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      window.location.href = 'app.html';
    });
  }
  initOverviewMap();
});
