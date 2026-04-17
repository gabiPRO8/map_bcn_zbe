const BARCELONA_CENTER = [41.3874, 2.1686];
const BARCELONA_VIEWBOX = "2.0522,41.2971,2.2285,41.4696";
const ROUTE_COLORS = ["#174ea6", "#6ca8ff", "#8ab8ff"];
const DEFAULT_KML_FILES = [
  "Mapa_de_Cámaras_ZBE_Barcelona_2025.kml",
  "Mapa de Cámaras ZBE Barcelona 2025.kml",
];
const RECENT_SEARCHES_KEY = "bcnNavigatorRecentSearches";
const SAVED_PLACES_KEY = "bcnNavigatorSavedPlaces";
const LAST_LOCATION_KEY = "bcnNavigatorLastLocation";

const state = {
  map: null,
  normalLayer: null,
  transportLayer: null,
  currentLocation: null,
  destination: null,
  locationMarker: null,
  accuracyCircle: null,
  headingCone: null,
  destinationMarker: null,
  routes: [],
  routeLabels: [],
  selectedRouteId: null,
  routeOriginOverride: null,
  zbeCameras: [],
  zbeMarkersVisible: true,
  zbeMarkersLayer: null,
  locationWatchId: null,
  searchDebounceId: null,
  routeSheetDrag: null,
};

const els = {
  map: document.getElementById("map"),
  floatingSearch: document.getElementById("floatingSearch"),
  searchInput: document.getElementById("searchInput"),
  closeSearchBtn: document.getElementById("closeSearchBtn"),
  suggestionsList: document.getElementById("suggestionsList"),
  recentList: document.getElementById("recentList"),
  searchSheet: document.getElementById("searchSheet"),
  homeQuickBtn: document.getElementById("homeQuickBtn"),
  workQuickBtn: document.getElementById("workQuickBtn"),

  statusPill: document.getElementById("statusPill"),
  myLocationFab: document.getElementById("myLocationFab"),

  placeSheet: document.getElementById("placeSheet"),
  placeTitle: document.getElementById("placeTitle"),
  placeSubtitle: document.getElementById("placeSubtitle"),
  openDirectionsBtn: document.getElementById("openDirectionsBtn"),
  savePlaceBtn: document.getElementById("savePlaceBtn"),

  routeSheet: document.getElementById("routeSheet"),
  routeSheetHandle: document.getElementById("routeSheetHandle"),
  routeOriginText: document.getElementById("routeOriginText"),
  routeDestinationText: document.getElementById("routeDestinationText"),
  swapRouteBtn: document.getElementById("swapRouteBtn"),
  avoidCamerasToggle: document.getElementById("avoidCamerasToggle"),
  calculateRoutesBtn: document.getElementById("calculateRoutesBtn"),
  routeLoading: document.getElementById("routeLoading"),
  routesList: document.getElementById("routesList"),

  desktopStatus: document.getElementById("desktopStatus"),
  desktopDestinationInput: document.getElementById("desktopDestinationInput"),
  desktopSearchBtn: document.getElementById("desktopSearchBtn"),
  desktopSuggestions: document.getElementById("desktopSuggestions"),
  desktopLocateBtn: document.getElementById("desktopLocateBtn"),
  desktopAvoidToggle: document.getElementById("desktopAvoidToggle"),
  desktopCalculateBtn: document.getElementById("desktopCalculateBtn"),
  desktopRoutes: document.getElementById("desktopRoutes"),
};

function isDesktop() {
  return window.matchMedia("(min-width: 769px)").matches;
}

function setStatus(text) {
  if (els.statusPill) {
    els.statusPill.textContent = text;
  }
  if (els.desktopStatus) {
    els.desktopStatus.textContent = text;
  }
}

function showElement(el) {
  if (el) {
    el.classList.remove("hidden");
  }
}

function hideElement(el) {
  if (el) {
    el.classList.add("hidden");
  }
}

function createMyLocationIcon() {
  return L.divIcon({
    className: "my-location-icon-wrap",
    html: "<div class=\"my-location-dot\"></div>",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function createHeadingIcon(heading = 0) {
  return L.divIcon({
    className: "heading-cone-wrap",
    html: `<div class=\"heading-cone\" style=\"transform: rotate(${heading}deg);\"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 20],
  });
}

function createDestinationIcon() {
  return L.divIcon({
    className: "destination-pin-wrap",
    html:
      '<div class="destination-pin"><svg viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg"><path fill="#EA4335" d="M15 1C7.3 1 1 7.3 1 15c0 10.8 14 24 14 24s14-13.2 14-24C29 7.3 22.7 1 15 1zm0 19.2a5.2 5.2 0 1 1 0-10.4 5.2 5.2 0 0 1 0 10.4z"/></svg></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -22],
  });
}

function createCameraIcon() {
  return L.divIcon({
    className: "camera-dot-wrap",
    html: '<div class="camera-dot">📷</div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function createRouteLabelIcon(text) {
  return L.divIcon({
    className: "route-label-wrap",
    html: `<div class="route-label">${text}</div>`,
    iconSize: [72, 24],
    iconAnchor: [36, 12],
  });
}

function initMap() {
  state.map = L.map("map", {
    center: BARCELONA_CENTER,
    zoom: 13,
    zoomControl: true,
  });

  state.normalLayer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      subdomains: "abcd",
      attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/">CARTO</a>',
    }
  );

  state.transportLayer = L.tileLayer("https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors, style by <a href="https://memomaps.de/">MeMoMaps</a>',
  });

  state.normalLayer.addTo(state.map);
  state.zbeMarkersLayer = L.layerGroup().addTo(state.map);

  L.control
    .layers(
      {
        "Mapa normal": state.normalLayer,
        "Mapa transporte": state.transportLayer,
      },
      {
        "Cámaras ZBE": state.zbeMarkersLayer,
      },
      {
        collapsed: true,
        position: "topright",
      }
    )
    .addTo(state.map);

  state.map.on("zoomend", updateCameraVisibilityByZoom);
  state.map.on("overlayadd", (event) => {
    if (event.layer === state.zbeMarkersLayer) {
      state.zbeMarkersVisible = true;
      updateCameraVisibilityByZoom();
    }
  });

  state.map.on("overlayremove", (event) => {
    if (event.layer === state.zbeMarkersLayer) {
      state.zbeMarkersVisible = false;
    }
  });

  state.map.on("click", () => {
    if (!isDesktop()) {
      closeAllSheetsToIdle();
    }
  });
}

function setRouteLoading(loading) {
  if (!els.routeLoading) {
    return;
  }

  if (loading) {
    showElement(els.routeLoading);
  } else {
    hideElement(els.routeLoading);
  }
}

function getRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setRecentSearches(items) {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, 5)));
}

function pushRecentSearch(place) {
  const recents = getRecentSearches();
  const key = `${place.name}|${place.lat}|${place.lng}`;
  const next = [
    place,
    ...recents.filter((item) => `${item.name}|${item.lat}|${item.lng}` !== key),
  ].slice(0, 5);

  setRecentSearches(next);
  renderRecentSearches();
}

function saveFavoritePlace(place) {
  try {
    const raw = localStorage.getItem(SAVED_PLACES_KEY);
    const current = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(current) ? current : [];
    const key = `${place.name}|${place.lat}|${place.lng}`;
    const updated = [place, ...list.filter((item) => `${item.name}|${item.lat}|${item.lng}` !== key)].slice(0, 20);
    localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(updated));
  } catch {
    // noop
  }
}

function renderSearchList(listEl, items, onSelect) {
  if (!listEl) {
    return;
  }

  listEl.innerHTML = "";

  if (!items.length) {
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-item";

    const title = item.name || item.display_name || "Lugar";
    const subtitle = item.address || item.display_name || "Barcelona";

    btn.innerHTML = `
      <span class="search-item-icon">📍</span>
      <span>
        <p class="search-item-title">${escapeHtml(title)}</p>
        <p class="search-item-subtitle">${escapeHtml(subtitle)}</p>
      </span>
    `;

    btn.addEventListener("click", () => onSelect(item));
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

function renderRecentSearches() {
  const recents = getRecentSearches();
  renderSearchList(els.recentList, recents, (item) => {
    selectDestination(item);
    closeSearchSheet();
  });
}

function openSearchSheet() {
  showElement(els.searchSheet);
  renderRecentSearches();
  window.setTimeout(() => {
    els.searchInput?.focus();
  }, 30);
}

function closeSearchSheet() {
  hideElement(els.searchSheet);
}

function openPlaceSheet() {
  showElement(els.placeSheet);
  hideElement(els.routeSheet);
}

function openRouteSheet(expanded = false) {
  showElement(els.routeSheet);
  hideElement(els.placeSheet);
  if (expanded) {
    els.routeSheet.classList.add("expanded");
    els.routeSheet.style.transform = "translateY(0)";
  } else {
    els.routeSheet.classList.remove("expanded");
    els.routeSheet.style.transform = "translateY(calc(100% - 120px))";
  }
}

function closeAllSheetsToIdle() {
  closeSearchSheet();
  hideElement(els.placeSheet);
  hideElement(els.routeSheet);
  if (!isDesktop()) {
    renderRoutes([], null);
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortName(displayName) {
  const firstPart = String(displayName || "").split(",")[0].trim();
  return firstPart || displayName || "Destino";
}

async function searchNominatim(query) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "8",
    countrycodes: "es",
    viewbox: BARCELONA_VIEWBOX,
    bounded: "1",
    addressdetails: "1",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar sugerencias");
  }

  const items = await response.json();
  return items.map((item) => ({
    name: shortName(item.display_name),
    address: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
  }));
}

function debounceSearchSuggestions(query) {
  if (state.searchDebounceId) {
    clearTimeout(state.searchDebounceId);
  }

  if (!query.trim()) {
    renderSearchList(els.suggestionsList, [], () => {});
    return;
  }

  state.searchDebounceId = window.setTimeout(async () => {
    try {
      const suggestions = await searchNominatim(query.trim());
      renderSearchList(els.suggestionsList, suggestions, (item) => {
        selectDestination(item);
        closeSearchSheet();
      });

      if (isDesktop()) {
        renderSearchList(els.desktopSuggestions, suggestions, (item) => {
          selectDestination(item);
          hideElement(els.desktopSuggestions);
        });
        if (suggestions.length) {
          showElement(els.desktopSuggestions);
        } else {
          hideElement(els.desktopSuggestions);
        }
      }
    } catch (error) {
      console.warn(error.message);
    }
  }, 220);
}

function selectDestination(item) {
  const destination = {
    name: item.name,
    address: item.address,
    lat: Number(item.lat),
    lng: Number(item.lng),
  };

  state.destination = destination;
  state.routeOriginOverride = null;

  if (state.destinationMarker) {
    state.map.removeLayer(state.destinationMarker);
  }

  state.destinationMarker = L.marker([destination.lat, destination.lng], {
    icon: createDestinationIcon(),
  }).addTo(state.map);

  state.destinationMarker
    .bindTooltip(destination.name, {
      direction: "top",
      offset: [0, -14],
      permanent: true,
      className: "destination-name-tooltip",
    })
    .openTooltip();

  state.map.setView([destination.lat, destination.lng], 16, {
    animate: true,
  });

  els.placeTitle.textContent = destination.name;
  els.placeSubtitle.textContent = destination.address;
  els.routeDestinationText.textContent = destination.name;
  els.routeOriginText.textContent = "Your location";
  if (els.desktopDestinationInput) {
    els.desktopDestinationInput.value = destination.address;
  }

  pushRecentSearch(destination);

  if (!isDesktop()) {
    openPlaceSheet();
  }
}

function updateLocationVisual(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const accuracy = Number(position.coords.accuracy || 30);
  const heading = Number.isFinite(position.coords.heading) ? position.coords.heading : null;

  state.currentLocation = {
    lat,
    lng,
    accuracy,
    heading,
  };

  localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(state.currentLocation));

  const latLng = [lat, lng];

  if (!state.locationMarker) {
    state.locationMarker = L.marker(latLng, { icon: createMyLocationIcon() }).addTo(state.map);
  } else {
    state.locationMarker.setLatLng(latLng);
  }

  if (!state.accuracyCircle) {
    state.accuracyCircle = L.circle(latLng, {
      radius: Math.max(accuracy, 10),
      color: "#1a73e8",
      weight: 1,
      opacity: 0.45,
      fillColor: "#1a73e8",
      fillOpacity: 0.14,
    }).addTo(state.map);
  } else {
    state.accuracyCircle.setLatLng(latLng);
    state.accuracyCircle.setRadius(Math.max(accuracy, 10));
  }

  if (heading !== null) {
    if (!state.headingCone) {
      state.headingCone = L.marker(latLng, { icon: createHeadingIcon(heading), interactive: false }).addTo(state.map);
    } else {
      state.headingCone.setLatLng(latLng);
      state.headingCone.setIcon(createHeadingIcon(heading));
    }
  } else if (state.headingCone) {
    state.map.removeLayer(state.headingCone);
    state.headingCone = null;
  }

  setStatus(`Ubicación: ${lat.toFixed(5)}, ${lng.toFixed(5)} ±${Math.round(accuracy)} m`);
}

function restoreCachedLocation() {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (!Number.isFinite(parsed?.lat) || !Number.isFinite(parsed?.lng)) {
      return;
    }

    updateLocationVisual({
      coords: {
        latitude: parsed.lat,
        longitude: parsed.lng,
        accuracy: Number.isFinite(parsed.accuracy) ? parsed.accuracy : 80,
        heading: Number.isFinite(parsed.heading) ? parsed.heading : null,
      },
    });
  } catch {
    // noop
  }
}

function startLocationTracking() {
  if (!navigator.geolocation) {
    setStatus("Ubicación no soportada en este navegador");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      updateLocationVisual(position);
      state.map.setView([position.coords.latitude, position.coords.longitude], 15);
    },
    (error) => {
      const reason = error?.code === 1 ? "permiso denegado" : "GPS no disponible";
      setStatus(`Ubicación: ${reason}. Toca ⌖ para reintentar`);
    },
    {
      enableHighAccuracy: true,
      timeout: 22000,
      maximumAge: 0,
    }
  );

  if (state.locationWatchId !== null) {
    navigator.geolocation.clearWatch(state.locationWatchId);
  }

  state.locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      updateLocationVisual(position);
    },
    (error) => {
      if (error?.code === 1) {
        setStatus("Ubicación: permiso bloqueado");
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 24000,
      maximumAge: 12000,
    }
  );
}

function centerOnLocation() {
  if (!state.currentLocation) {
    startLocationTracking();
    return;
  }

  state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 16);
}

function parseKmlCoordinates(text) {
  const chunks = String(text || "")
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.split(",").map(Number))
    .filter((coords) => coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]));

  return chunks.map(([lng, lat]) => ({ lat, lng }));
}

function clearCameras() {
  state.zbeCameras = [];
  state.zbeMarkersLayer.clearLayers();
}

function updateCameraVisibilityByZoom() {
  const zoom = state.map.getZoom();
  const shouldShow = zoom >= 14;

  if (shouldShow && state.zbeMarkersVisible) {
    if (!state.map.hasLayer(state.zbeMarkersLayer)) {
      state.zbeMarkersLayer.addTo(state.map);
    }
  } else if (state.map.hasLayer(state.zbeMarkersLayer)) {
    state.map.removeLayer(state.zbeMarkersLayer);
  }
}

function applyKmlContent(xmlText) {
  clearCameras();

  const xml = new DOMParser().parseFromString(xmlText, "text/xml");
  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error("KML inválido");
  }

  const placemarks = Array.from(xml.getElementsByTagName("Placemark"));

  placemarks.forEach((placemark, index) => {
    const nameNode = placemark.getElementsByTagName("name")[0] || placemark.getElementsByTagName("n")[0];
    const coordinatesNode = placemark.getElementsByTagName("coordinates")[0];

    if (!coordinatesNode) {
      return;
    }

    const parsed = parseKmlCoordinates(coordinatesNode.textContent || "");
    if (!parsed.length) {
      return;
    }

    const first = parsed[0];
    const camera = {
      name: nameNode?.textContent?.trim() || `Cámara ${index + 1}`,
      lat: first.lat,
      lng: first.lng,
      address: `${first.lat.toFixed(5)}, ${first.lng.toFixed(5)}`,
    };

    state.zbeCameras.push(camera);

    L.marker([camera.lat, camera.lng], {
      icon: createCameraIcon(),
    })
      .addTo(state.zbeMarkersLayer)
      .bindTooltip(`<strong>${escapeHtml(camera.name)}</strong><br/>${escapeHtml(camera.address)}`);
  });

  updateCameraVisibilityByZoom();
}

async function preloadDefaultKml() {
  let loaded = false;

  for (const fileName of DEFAULT_KML_FILES) {
    try {
      const response = await fetch(encodeURI(fileName));
      if (!response.ok) {
        continue;
      }

      const xmlText = await response.text();
      applyKmlContent(xmlText);
      loaded = true;
      break;
    } catch {
      // try next filename
    }
  }

  if (!loaded) {
    console.warn("No se pudo cargar automáticamente el KML de cámaras ZBE");
  }
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistanceMeters(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return haversineMeters(px, py, ax, ay);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return haversineMeters(px, py, projX, projY);
}

function getCamerasNearRoute(routeCoordsLngLat, radiusMeters = 80) {
  const near = [];

  if (!state.zbeCameras.length || !routeCoordsLngLat?.length) {
    return near;
  }

  for (const cam of state.zbeCameras) {
    for (let i = 0; i < routeCoordsLngLat.length - 1; i += 1) {
      const [aLng, aLat] = routeCoordsLngLat[i];
      const [bLng, bLat] = routeCoordsLngLat[i + 1];
      const d = pointToSegmentDistanceMeters(cam.lat, cam.lng, aLat, aLng, bLat, bLng);
      if (d <= radiusMeters) {
        near.push(cam);
        break;
      }
    }
  }

  return near;
}

function decodePolyline(encoded, precision = 6) {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  const factor = 10 ** precision;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

function normalizeValhallaTrip(trip) {
  const leg = trip?.legs?.[0];
  const summary = trip?.summary || leg?.summary;
  const shape = leg?.shape;

  if (!summary || !shape) {
    return null;
  }

  return {
    distance: Number(summary.length || 0) * 1000,
    duration: Number(summary.time || 0),
    geometry: {
      coordinates: decodePolyline(shape, 6),
    },
  };
}

async function fetchValhallaRoutes(origin, destination, excludeLocations = [], alternates = 2) {
  const body = {
    locations: [
      { lon: origin.lng, lat: origin.lat },
      { lon: destination.lng, lat: destination.lat },
    ],
    costing: "auto",
    alternates,
    directions_options: {
      units: "kilometers",
      language: "es-ES",
    },
  };

  if (excludeLocations.length) {
    body.exclude_locations = excludeLocations;
  }

  const response = await fetch("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Valhalla no disponible");
  }

  const data = await response.json();

  const routes = [];
  const primary = normalizeValhallaTrip(data.trip);
  if (primary) {
    routes.push(primary);
  }

  const alternatives = (data.alternates || []).map((alt) => normalizeValhallaTrip(alt.trip)).filter(Boolean);
  routes.push(...alternatives);

  return routes.slice(0, 3);
}

async function fetchOsrmRoutes(origin, destination) {
  const params = new URLSearchParams({
    alternatives: "true",
    geometries: "geojson",
    overview: "full",
  });

  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("OSRM no disponible");
  }

  const data = await response.json();
  return (data.routes || []).slice(0, 3);
}

async function buildRoutes(origin, destination, avoidCameras) {
  let directRoutes = [];

  try {
    directRoutes = await fetchValhallaRoutes(origin, destination, [], 2);
  } catch {
    directRoutes = [];
  }

  if (!directRoutes.length) {
    directRoutes = await fetchOsrmRoutes(origin, destination);
  }

  let candidates = directRoutes;

  if (avoidCameras && state.zbeCameras.length) {
    try {
      const corridor = directRoutes[0];
      const nearby = corridor ? getCamerasNearRoute(corridor.geometry.coordinates, 300) : [];
      const selected = nearby.length ? nearby.slice(0, 60) : state.zbeCameras.slice(0, 60);
      const excludes = selected.map((cam) => ({ lon: cam.lng, lat: cam.lat }));
      const avoided = excludes.length
        ? await fetchValhallaRoutes(origin, destination, excludes, 2)
        : [];

      if (avoided.length) {
        candidates = [...avoided, ...directRoutes];
      }
    } catch {
      // fallback to direct
    }
  }

  const evaluated = candidates.slice(0, 3).map((route, idx) => {
    const cameras = getCamerasNearRoute(route.geometry.coordinates, 80);
    return {
      id: idx,
      raw: route,
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      camerasCount: cameras.length,
      passesZbe: cameras.length > 0,
    };
  });

  evaluated.sort((a, b) => {
    if (a.camerasCount !== b.camerasCount) {
      return a.camerasCount - b.camerasCount;
    }
    return a.durationMin - b.durationMin;
  });

  return evaluated;
}

function clearRoutes() {
  for (const route of state.routes) {
    if (route.polyline && state.map.hasLayer(route.polyline)) {
      state.map.removeLayer(route.polyline);
    }
  }

  for (const label of state.routeLabels) {
    if (state.map.hasLayer(label)) {
      state.map.removeLayer(label);
    }
  }

  state.routes = [];
  state.routeLabels = [];
  state.selectedRouteId = null;
}

function formatDistance(distanceKm) {
  return `${distanceKm.toFixed(1).replace(".", ",")} km`;
}

function formatDuration(minutes) {
  return `${Math.round(minutes)} min`;
}

function setSelectedRoute(routeId) {
  state.selectedRouteId = routeId;

  for (const route of state.routes) {
    const active = route.id === routeId;

    route.polyline.setStyle({
      color: active ? "#174ea6" : "#6ca8ff",
      weight: active ? 7 : 4,
      opacity: active ? 1 : 0.6,
    });

    if (active) {
      route.polyline.bringToFront();
    }
  }

  renderRoutesList();
}

function renderRoutesList() {
  const target = isDesktop() ? els.desktopRoutes : els.routesList;
  if (!target) {
    return;
  }

  target.innerHTML = "";

  for (const route of state.routes) {
    const article = document.createElement("article");
    article.className = `route-card${route.id === state.selectedRouteId ? " active" : ""}`;

    const badgeClass = route.passesZbe ? "badge-risk" : "badge-safe";
    const badgeText = route.passesZbe ? "⚠ ZBE" : "✓ Evita ZBE";

    article.innerHTML = `
      <div class="route-top">
        <p class="route-name">Ruta ${route.rank + 1}</p>
        <span class="route-badge ${badgeClass}">${badgeText}</span>
      </div>
      <p class="route-meta">${formatDuration(route.durationMin)} · ${formatDistance(route.distanceKm)}</p>
      <button class="btn btn-start route-start" type="button">▶ START</button>
    `;

    article.addEventListener("click", () => {
      setSelectedRoute(route.id);
    });

    target.appendChild(article);
  }
}

function renderRoutes(routeEvaluated, destinationBounds = null) {
  clearRoutes();

  if (!routeEvaluated.length) {
    renderRoutesList();
    return;
  }

  const bounds = destinationBounds ? [...destinationBounds] : [];

  state.routes = routeEvaluated.map((route, idx) => {
    const coords = route.raw.geometry.coordinates.map(([lng, lat]) => {
      bounds.push([lat, lng]);
      return [lat, lng];
    });

    const polyline = L.polyline(coords, {
      color: idx === 0 ? "#174ea6" : "#6ca8ff",
      weight: idx === 0 ? 7 : 4,
      opacity: idx === 0 ? 1 : 0.6,
    }).addTo(state.map);

    polyline.on("click", () => {
      setSelectedRoute(route.id);
      if (!isDesktop()) {
        openRouteSheet(true);
      }
    });

    const midpoint = coords[Math.floor(coords.length / 2)] || coords[0];
    const timeLabel = L.marker(midpoint, {
      icon: createRouteLabelIcon(formatDuration(route.durationMin)),
      interactive: false,
    }).addTo(state.map);

    state.routeLabels.push(timeLabel);

    return {
      ...route,
      rank: idx,
      coordinates: coords,
      polyline,
    };
  });

  setSelectedRoute(state.routes[0].id);

  if (bounds.length) {
    state.map.fitBounds(bounds, { padding: [30, 30] });
  }
}

async function calculateRoutesFlow() {
  if (!state.destination) {
    alert("Selecciona un destino primero");
    return;
  }

  if (!state.currentLocation) {
    startLocationTracking();
    if (!state.currentLocation) {
      alert("No se pudo obtener tu ubicación actual");
      return;
    }
  }

  const origin = state.routeOriginOverride
    ? { lat: state.routeOriginOverride.lat, lng: state.routeOriginOverride.lng }
    : { lat: state.currentLocation.lat, lng: state.currentLocation.lng };

  const destination = {
    lat: state.destination.lat,
    lng: state.destination.lng,
  };

  const avoidCameras = isDesktop()
    ? Boolean(els.desktopAvoidToggle?.checked)
    : Boolean(els.avoidCamerasToggle?.checked);

  setRouteLoading(true);

  try {
    const routeResults = await buildRoutes(origin, destination, avoidCameras);
    renderRoutes(routeResults, [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ]);

    if (!isDesktop()) {
      openRouteSheet(true);
    }
  } catch (error) {
    console.error(error);
    alert("No se pudieron calcular las rutas");
  } finally {
    setRouteLoading(false);
  }
}

function swapOriginDestination() {
  if (!state.destination || !state.currentLocation) {
    return;
  }

  const previousDestination = { ...state.destination };
  state.routeOriginOverride = previousDestination;

  const newDestination = {
    name: "Your location",
    address: "Current GPS position",
    lat: state.currentLocation.lat,
    lng: state.currentLocation.lng,
  };

  selectDestination(newDestination);
  state.routeOriginOverride = previousDestination;
  els.routeOriginText.textContent = previousDestination.name;
  els.routeDestinationText.textContent = "Your location";
}

function setupRouteSheetDrag() {
  if (!els.routeSheet || !els.routeSheetHandle || isDesktop()) {
    return;
  }

  const sheet = els.routeSheet;
  const handle = els.routeSheetHandle;

  const onTouchStart = (event) => {
    if (sheet.classList.contains("hidden")) {
      return;
    }

    state.routeSheetDrag = {
      startY: event.touches[0].clientY,
      startTransform: sheet.classList.contains("expanded") ? 0 : sheet.offsetHeight - 120,
    };
  };

  const onTouchMove = (event) => {
    if (!state.routeSheetDrag) {
      return;
    }

    const currentY = event.touches[0].clientY;
    const delta = currentY - state.routeSheetDrag.startY;
    const next = Math.max(0, state.routeSheetDrag.startTransform + delta);
    sheet.style.transform = `translateY(${next}px)`;
  };

  const onTouchEnd = () => {
    if (!state.routeSheetDrag) {
      return;
    }

    const matrix = window.getComputedStyle(sheet).transform;
    let translateY = 0;

    if (matrix && matrix !== "none") {
      const values = matrix.split("(")[1].split(")")[0].split(",");
      translateY = Number(values[5] || 0);
    }

    if (translateY > 140) {
      sheet.classList.remove("expanded");
      sheet.style.transform = "translateY(calc(100% - 120px))";
    } else {
      sheet.classList.add("expanded");
      sheet.style.transform = "translateY(0)";
    }

    state.routeSheetDrag = null;
  };

  handle.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
}

function bindEvents() {
  els.floatingSearch?.addEventListener("click", openSearchSheet);
  els.floatingSearch?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSearchSheet();
    }
  });

  els.closeSearchBtn?.addEventListener("click", closeSearchSheet);

  els.searchInput?.addEventListener("input", (event) => {
    debounceSearchSuggestions(event.target.value);
  });

  els.homeQuickBtn?.addEventListener("click", () => {
    const query = "Casa, Barcelona";
    els.searchInput.value = query;
    debounceSearchSuggestions(query);
  });

  els.workQuickBtn?.addEventListener("click", () => {
    const query = "Trabajo, Barcelona";
    els.searchInput.value = query;
    debounceSearchSuggestions(query);
  });

  els.openDirectionsBtn?.addEventListener("click", () => {
    if (!state.destination) {
      return;
    }

    els.routeDestinationText.textContent = state.destination.name;
    els.routeOriginText.textContent = "Your location";
    openRouteSheet(false);
  });

  els.savePlaceBtn?.addEventListener("click", () => {
    if (!state.destination) {
      return;
    }

    saveFavoritePlace(state.destination);
    alert("Lugar guardado");
  });

  els.calculateRoutesBtn?.addEventListener("click", calculateRoutesFlow);
  els.swapRouteBtn?.addEventListener("click", swapOriginDestination);

  els.myLocationFab?.addEventListener("click", centerOnLocation);

  els.desktopLocateBtn?.addEventListener("click", centerOnLocation);

  els.desktopSearchBtn?.addEventListener("click", async () => {
    const query = (els.desktopDestinationInput?.value || "").trim();
    if (!query) {
      return;
    }

    try {
      const results = await searchNominatim(query);
      renderSearchList(els.desktopSuggestions, results, (item) => {
        selectDestination(item);
        hideElement(els.desktopSuggestions);
      });
      showElement(els.desktopSuggestions);
    } catch {
      alert("No se pudo buscar el destino");
    }
  });

  els.desktopDestinationInput?.addEventListener("input", (event) => {
    debounceSearchSuggestions(event.target.value);
  });

  els.desktopCalculateBtn?.addEventListener("click", calculateRoutesFlow);

  document.addEventListener("click", (event) => {
    if (!els.searchSheet?.classList.contains("hidden") && !els.searchSheet.contains(event.target) && event.target !== els.floatingSearch) {
      closeSearchSheet();
    }
  });
}

async function boot() {
  initMap();
  bindEvents();
  setupRouteSheetDrag();
  restoreCachedLocation();
  await preloadDefaultKml();
  startLocationTracking();
  setStatus("Ubicación: iniciando GPS...");
}

boot();
