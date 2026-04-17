const BARCELONA_CENTER = [41.3874, 2.1686];
const BARCELONA_VIEWBOX = "2.0522,41.2971,2.2285,41.4696";
const ROUTE_COLORS = ["#4A90E2", "#27AE60", "#E67E22", "#9B59B6"];
const DEFAULT_KML_FILE = "Mapa de Cámaras ZBE Barcelona 2025.kml";

const zbeCameras = [];
window.zbeCameras = zbeCameras;

let map;
let placeMarker = null;
let originMarker = null;
let destinationMarker = null;
let myLocationMarker = null;
let originPoint = null;
let destinationPoint = null;
let routesData = [];
let activeRouteId = null;
let locationWatchId = null;
let locationTrackingActive = false;
let lastKnownLocation = null;
let sidebarOpen = true;
let mobileLayout = false;
let firstLocationFix = false;

let normalLayer;
let transportLayer;
let zbeLayerGroup;

const els = {
  placeInput: document.getElementById("placeInput"),
  placeSearchBtn: document.getElementById("placeSearchBtn"),
  placeResults: document.getElementById("placeResults"),
  selectedName: document.getElementById("selectedName"),
  selectedLat: document.getElementById("selectedLat"),
  selectedLng: document.getElementById("selectedLng"),
  selectedType: document.getElementById("selectedType"),
  mapClickCoords: document.getElementById("mapClickCoords"),

  originInput: document.getElementById("originInput"),
  originSearchBtn: document.getElementById("originSearchBtn"),
  originResults: document.getElementById("originResults"),

  destinationInput: document.getElementById("destinationInput"),
  destinationSearchBtn: document.getElementById("destinationSearchBtn"),
  destinationResults: document.getElementById("destinationResults"),

  calculateRoutesBtn: document.getElementById("calculateRoutesBtn"),
  clearRoutesBtn: document.getElementById("clearRoutesBtn"),
  routesList: document.getElementById("routesList"),

  avoidZbeCheckbox: document.getElementById("avoidZbeCheckbox"),
  toggleZbeLayer: document.getElementById("toggleZbeLayer"),
  loadKmlBtn: document.getElementById("loadKmlBtn"),
  kmlFileInput: document.getElementById("kmlFileInput"),
  zbeCounter: document.getElementById("zbeCounter"),
  locationStatus: document.getElementById("locationStatus"),
  sidebar: document.getElementById("sidebar"),
  panelToggleBtn: document.getElementById("panelToggleBtn"),

  myLocationBtn: document.getElementById("myLocationBtn"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText"),
};

const mobileQuery = window.matchMedia("(max-width: 900px)");

function initMap() {
  map = L.map("map", {
    center: BARCELONA_CENTER,
    zoom: 13,
    zoomControl: true,
  });

  normalLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/">CARTO</a>',
  });

  transportLayer = L.tileLayer("https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors, style by <a href="https://memomaps.de/">MeMoMaps</a>',
  });

  normalLayer.addTo(map);

  zbeLayerGroup = L.layerGroup().addTo(map);

  L.control
    .layers(
      {
        "Mapa normal": normalLayer,
        "Mapa transporte": transportLayer,
      },
      {
        "Radares ZBE": zbeLayerGroup,
      },
      { collapsed: false }
    )
    .addTo(map);

  L.control.scale({ imperial: false }).addTo(map);

  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    els.mapClickCoords.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  });

  transportLayer.on("tileerror", () => {
    console.warn("La capa de transporte no cargo correctamente.");
  });
}

function setLoading(isLoading, text = "Cargando...") {
  if (isLoading) {
    els.loadingText.textContent = text;
    els.loadingOverlay.classList.remove("hidden");
  } else {
    els.loadingOverlay.classList.add("hidden");
  }
}

function updateLocationStatus(text) {
  if (els.locationStatus) {
    els.locationStatus.textContent = text;
  }
}

function setSidebarOpen(open) {
  sidebarOpen = open;
  els.sidebar.classList.toggle("sidebar-open", open);

  if (els.panelToggleBtn) {
    els.panelToggleBtn.textContent = open ? "Cerrar panel" : "Abrir panel";
  }

  window.setTimeout(() => {
    if (map) {
      map.invalidateSize();
    }
  }, 320);
}

function syncMobileLayout() {
  mobileLayout = mobileQuery.matches;
  document.body.classList.toggle("mobile-layout", mobileLayout);

  if (mobileLayout) {
    setSidebarOpen(sidebarOpen);
  } else {
    setSidebarOpen(true);
  }
}

function createDivIcon(className, html = "") {
  return L.divIcon({
    className,
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10],
  });
}

function formatDistance(kmValue) {
  return `${kmValue.toFixed(2)} km`;
}

function formatDuration(minutesValue) {
  return `${Math.round(minutesValue)} min`;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
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
  const nearby = [];

  if (!zbeCameras.length || !routeCoordsLngLat?.length) {
    return nearby;
  }

  for (const cam of zbeCameras) {
    for (let i = 0; i < routeCoordsLngLat.length - 1; i += 1) {
      const [aLng, aLat] = routeCoordsLngLat[i];
      const [bLng, bLat] = routeCoordsLngLat[i + 1];

      const dist = pointToSegmentDistanceMeters(cam.lat, cam.lng, aLat, aLng, bLat, bLng);
      if (dist < radiusMeters) {
        nearby.push({
          ...cam,
          segmentIndex: i,
          aLat,
          aLng,
          bLat,
          bLng,
        });
        break;
      }
    }
  }

  return nearby;
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

  if (!shape || !summary) {
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

async function fetchValhallaRoutes(origin, destination, excludeLocations = [], alternates = 3) {
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
    costing_options: {
      auto: {
        use_highways: 0.4,
      },
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
    throw new Error("Error consultando Valhalla");
  }

  const data = await response.json();
  const routes = [];

  const primary = normalizeValhallaTrip(data.trip);
  if (primary) {
    routes.push(primary);
  }

  const alternatesTrips = (data.alternates || []).map((alt) => normalizeValhallaTrip(alt.trip)).filter(Boolean);
  routes.push(...alternatesTrips);

  return routes.slice(0, 4);
}

async function fetchOsrmFallbackRoutes(origin, destination) {
  const params = new URLSearchParams({
    alternatives: "true",
    steps: "true",
    geometries: "geojson",
    overview: "full",
  });

  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Error consultando OSRM");
  }

  const data = await response.json();
  return (data.routes || []).slice(0, 4);
}

function rankRoutesByZbe(routes) {
  return [...routes].sort((a, b) => {
    if (a.camerasCount !== b.camerasCount) {
      return a.camerasCount - b.camerasCount;
    }

    if (a.rawRoute.duration !== b.rawRoute.duration) {
      return a.rawRoute.duration - b.rawRoute.duration;
    }

    return a.rawRoute.distance - b.rawRoute.distance;
  });
}

async function buildRouteWithZbeAvoidance(origin, destination) {
  let directRoutes = [];

  try {
    directRoutes = await fetchValhallaRoutes(origin, destination, [], 3);
  } catch (error) {
    console.warn("Valhalla no disponible, usando OSRM", error);
  }

  if (!directRoutes.length) {
    directRoutes = await fetchOsrmFallbackRoutes(origin, destination);
  }

  let candidateRoutes = directRoutes;

  if (els.avoidZbeCheckbox.checked && zbeCameras.length) {
    try {
      const corridorSource = directRoutes[0];
      const nearbyCameras = corridorSource
        ? getCamerasNearRoute(corridorSource.geometry.coordinates, 300)
        : [];

      const selectedCameras = nearbyCameras.length ? nearbyCameras : zbeCameras.slice(0, 40);
      const excludeLocations = selectedCameras.slice(0, 60).map((cam) => ({
        lon: cam.lng,
        lat: cam.lat,
      }));

      const avoidedRoutes = excludeLocations.length
        ? await fetchValhallaRoutes(origin, destination, excludeLocations, 3)
        : [];

      if (avoidedRoutes.length) {
        candidateRoutes = [...avoidedRoutes, ...directRoutes];
      }
    } catch (error) {
      console.warn("No se pudo calcular exclusion ZBE en Valhalla", error);
    }
  }

  const evaluated = candidateRoutes.slice(0, 8).map((route) => {
    const camerasOnRoute = getCamerasNearRoute(route.geometry.coordinates, 80);

    return {
      rawRoute: route,
      passesZBE: camerasOnRoute.length > 0,
      camerasCount: camerasOnRoute.length,
    };
  });

  const ranked = els.avoidZbeCheckbox.checked ? rankRoutesByZbe(evaluated) : evaluated;
  return ranked.slice(0, 4);
}

function checkRouteZBE(routeCoordinates) {
  if (!zbeCameras.length || !routeCoordinates?.length) {
    return false;
  }

  const coordsLngLat = routeCoordinates.map(([lat, lng]) => [lng, lat]);
  return getCamerasNearRoute(coordsLngLat, 80).length > 0;
}

function hideResults(listEl) {
  listEl.innerHTML = "";
  listEl.classList.add("hidden");
}

function showResults(listEl, results, onClickItem) {
  if (!results.length) {
    hideResults(listEl);
    return;
  }

  listEl.innerHTML = "";
  results.forEach((item) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.className = "result-item";
    button.type = "button";
    button.textContent = item.display_name;
    button.addEventListener("click", () => onClickItem(item));

    li.appendChild(button);
    listEl.appendChild(li);
  });

  listEl.classList.remove("hidden");
}

async function searchNominatim(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmed,
    format: "json",
    limit: "5",
    countrycodes: "es",
    viewbox: BARCELONA_VIEWBOX,
    bounded: "1",
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Error consultando Nominatim");
  }

  return response.json();
}

function updateSelectedPlaceInfo(item) {
  els.selectedName.textContent = item.display_name || "-";
  els.selectedLat.textContent = Number(item.lat).toFixed(6);
  els.selectedLng.textContent = Number(item.lon).toFixed(6);
  els.selectedType.textContent = item.type || item.class || "-";
}

function placeSearchMarker(item) {
  const lat = Number(item.lat);
  const lng = Number(item.lon);

  if (placeMarker) {
    map.removeLayer(placeMarker);
  }

  placeMarker = L.marker([lat, lng], {
    icon: createDivIcon("blue-marker"),
  })
    .addTo(map)
    .bindPopup(`<strong>${item.display_name}</strong><br/>${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    .openPopup();

  map.setView([lat, lng], 16);
  updateSelectedPlaceInfo(item);
}

function placeRoutePointMarker(type, point) {
  const markerClass = type === "origin" ? "route-marker-origin" : "route-marker-destination";

  if (type === "origin" && originMarker) {
    map.removeLayer(originMarker);
  }

  if (type === "destination" && destinationMarker) {
    map.removeLayer(destinationMarker);
  }

  const marker = L.marker([point.lat, point.lng], {
    icon: createDivIcon(markerClass),
  }).addTo(map);

  marker.bindPopup(`<strong>${type === "origin" ? "Origen" : "Destino"}</strong><br/>${point.name}`);

  if (type === "origin") {
    originMarker = marker;
  } else {
    destinationMarker = marker;
  }
}

function stopLiveLocationTracking() {
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }

  locationTrackingActive = false;
  firstLocationFix = false;

  if (els.myLocationBtn) {
    els.myLocationBtn.textContent = "📍 Mi ubicación";
  }

  updateLocationStatus("Ubicación en vivo: desactivada");
}

function updateLiveLocation(position) {
  const { latitude, longitude, accuracy } = position.coords;

  lastKnownLocation = {
    lat: latitude,
    lng: longitude,
    accuracy,
  };

  originPoint = {
    name: "Mi ubicación actual",
    lat: latitude,
    lng: longitude,
  };

  els.originInput.value = "Mi ubicación actual";

  if (myLocationMarker) {
    myLocationMarker.setLatLng([latitude, longitude]);
  } else {
    myLocationMarker = L.marker([latitude, longitude], {
      icon: createDivIcon("my-location-dot"),
    }).addTo(map);
  }

  myLocationMarker.bindPopup("Tu ubicación actual");

  if (originMarker) {
    map.removeLayer(originMarker);
    originMarker = null;
  }

  const shouldCenter = !firstLocationFix || mobileLayout;
  if (shouldCenter) {
    map.setView([latitude, longitude], mobileLayout ? 16 : 15);
  }

  firstLocationFix = true;

  updateLocationStatus(`Ubicación en vivo: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} ±${Math.round(accuracy)} m`);
}

function startLiveLocationTracking() {
  if (!navigator.geolocation) {
    alert("Tu navegador no soporta geolocalizacion");
    return;
  }

  if (locationWatchId !== null) {
    return;
  }

  locationTrackingActive = true;

  if (els.myLocationBtn) {
    els.myLocationBtn.textContent = "⏸ Parar ubicación";
  }

  updateLocationStatus("Ubicación en vivo: buscando señal...");
  setLoading(true, "Obteniendo ubicación...");

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      updateLiveLocation(position);
      setLoading(false);
    },
    (error) => {
      console.error(error);
      setLoading(false);
      stopLiveLocationTracking();
      alert("No se pudo obtener tu ubicación");
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    }
  );
}

function toggleLiveLocationTracking() {
  if (locationTrackingActive) {
    stopLiveLocationTracking();
    return;
  }

  startLiveLocationTracking();
}

async function autoStartLiveLocationIfAllowed() {
  if (!navigator.permissions?.query || !navigator.geolocation) {
    return;
  }

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    if (permission.state === "granted") {
      startLiveLocationTracking();
    }
  } catch (error) {
    console.warn("No se pudo comprobar permiso de geolocalizacion", error);
  }
}

function getRouteRanking() {
  const data = [...routesData];

  if (els.avoidZbeCheckbox.checked) {
    data.sort((a, b) => Number(a.passesZBE) - Number(b.passesZBE));
  }

  return data;
}

function renderRoutesPanel() {
  els.routesList.innerHTML = "";

  if (!routesData.length) {
    return;
  }

  const rankedRoutes = getRouteRanking();

  rankedRoutes.forEach((route, index) => {
    const card = document.createElement("article");
    card.className = "route-card";
    card.style.borderLeftColor = route.color;

    if (route.id === activeRouteId) {
      card.classList.add("active");
    }

    const zbeText = route.passesZBE ? "⚠ Pasa por ZBE" : "✓ Evita ZBE";
    const zbeClass = route.passesZBE ? "badge badge-risk" : "badge badge-safe";

    card.innerHTML = `
      <div class="route-title">
        <span>Ruta ${index + 1}</span>
        <span class="${zbeClass}">${zbeText}</span>
      </div>
      <div class="route-meta">
        <span>${formatDistance(route.distanceKm)}</span>
        <span>${formatDuration(route.durationMin)}</span>
        <span>${route.camerasCount || 0} cam</span>
      </div>
    `;

    card.addEventListener("click", () => setActiveRoute(route.id));
    els.routesList.appendChild(card);
  });
}

function setActiveRoute(routeId) {
  activeRouteId = routeId;

  routesData.forEach((route) => {
    const isActive = route.id === routeId;

    route.polyline.setStyle({
      color: route.color,
      weight: isActive ? 7 : 5,
      opacity: isActive ? 1 : 0.4,
    });

    if (isActive) {
      route.polyline.bringToFront();
    }
  });

  renderRoutesPanel();
}

function clearRoutes() {
  routesData.forEach((route) => {
    if (route.polyline && map.hasLayer(route.polyline)) {
      map.removeLayer(route.polyline);
    }
  });

  routesData = [];
  activeRouteId = null;
  els.routesList.innerHTML = "";
}

async function ensurePointFromInput(inputEl, currentPoint, resultListEl, type) {
  if (currentPoint) {
    return currentPoint;
  }

  const query = inputEl.value.trim();
  if (!query) {
    throw new Error(`Debes definir ${type === "origin" ? "origen" : "destino"}`);
  }

  const items = await searchNominatim(query);
  if (!items.length) {
    throw new Error(`No se encontro ${type === "origin" ? "origen" : "destino"}`);
  }

  const item = items[0];
  const point = {
    name: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
  };

  inputEl.value = item.display_name;
  hideResults(resultListEl);

  placeRoutePointMarker(type, point);

  if (type === "origin") {
    originPoint = point;
  } else {
    destinationPoint = point;
  }

  return point;
}

async function calculateRoutes() {
  try {
    setLoading(true, "Calculando rutas...");

    const origin = await ensurePointFromInput(els.originInput, originPoint, els.originResults, "origin");
    const destination = await ensurePointFromInput(
      els.destinationInput,
      destinationPoint,
      els.destinationResults,
      "destination"
    );

    const routed = await buildRouteWithZbeAvoidance(origin, destination);
    if (!routed.length) {
      throw new Error("OSRM no devolvio rutas");
    }

    clearRoutes();

    const mapBounds = [];

    routesData = routed.slice(0, 4).map((item, index) => {
      const route = item.rawRoute;

      const latLngCoords = route.geometry.coordinates.map(([lng, lat]) => {
        mapBounds.push([lat, lng]);
        return [lat, lng];
      });

      const polyline = L.polyline(latLngCoords, {
        color: ROUTE_COLORS[index],
        weight: index === 0 ? 7 : 5,
        opacity: index === 0 ? 1 : 0.4,
      }).addTo(map);

      const routeData = {
        id: index,
        color: ROUTE_COLORS[index],
        polyline,
        coordinates: latLngCoords,
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
        passesZBE: item.passesZBE,
        camerasCount: item.camerasCount,
      };

      polyline.on("click", () => setActiveRoute(routeData.id));
      return routeData;
    });

    const rankedRoutes = getRouteRanking();
    const preferred = rankedRoutes[0];
    activeRouteId = preferred ? preferred.id : 0;

    setActiveRoute(activeRouteId);

    if (mapBounds.length) {
      map.fitBounds(mapBounds, { padding: [30, 30] });
    }
  } catch (error) {
    console.error(error);
    alert(error.message || "No se pudo calcular la ruta");
  } finally {
    setLoading(false);
  }
}

async function executeSearch(inputEl, listEl, onSelect) {
  try {
    const query = inputEl.value.trim();
    if (!query) {
      hideResults(listEl);
      return;
    }

    setLoading(true, "Buscando lugares...");
    const results = await searchNominatim(query);
    showResults(listEl, results, onSelect);
  } catch (error) {
    console.error(error);
    alert("No se pudo completar la busqueda");
  } finally {
    setLoading(false);
  }
}

function attachSearchEvents(inputEl, buttonEl, listEl, selectHandler) {
  buttonEl.addEventListener("click", () => executeSearch(inputEl, listEl, selectHandler));

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      executeSearch(inputEl, listEl, selectHandler);
    }
  });
}

function parseKmlCoordinates(text) {
  const chunks = text
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.split(",").map(Number))
    .filter((coords) => coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]));

  return chunks.map(([lng, lat]) => ({ lat, lng }));
}

function clearZbeData() {
  zbeCameras.length = 0;
  zbeLayerGroup.clearLayers();
  updateZbeCounter();
}

function updateZbeCounter() {
  els.zbeCounter.textContent = `${zbeCameras.length} radares ZBE cargados`;
}

function applyKmlContent(xmlText) {
  clearZbeData();

  const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");
  const parseError = xmlDoc.querySelector("parsererror");

  if (parseError) {
    throw new Error("Archivo KML invalido");
  }

  const placemarks = Array.from(xmlDoc.getElementsByTagName("Placemark"));

  placemarks.forEach((placemark, index) => {
    const nameNode = placemark.getElementsByTagName("name")[0];
    const coordinatesNode = placemark.getElementsByTagName("coordinates")[0];

    if (!coordinatesNode) {
      return;
    }

    const cameraName = nameNode?.textContent?.trim() || `Radar ${index + 1}`;
    const parsedCoords = parseKmlCoordinates(coordinatesNode.textContent || "");

    if (!parsedCoords.length) {
      return;
    }

    const first = parsedCoords[0];

    zbeCameras.push({
      name: cameraName,
      lat: first.lat,
      lng: first.lng,
    });

    L.marker([first.lat, first.lng], {
      icon: createDivIcon("camera-marker", "📷"),
    })
      .addTo(zbeLayerGroup)
      .bindPopup(`<strong>${cameraName}</strong><br/>${first.lat.toFixed(6)}, ${first.lng.toFixed(6)}`);
  });

  updateZbeCounter();

  routesData = routesData.map((route) => ({
    ...route,
    passesZBE: checkRouteZBE(route.coordinates),
  }));

  if (routesData.length) {
    const ranked = getRouteRanking();
    if (els.avoidZbeCheckbox.checked && ranked.length) {
      activeRouteId = ranked[0].id;
      setActiveRoute(activeRouteId);
    } else {
      renderRoutesPanel();
    }
  }
}

function loadKmlFile(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const xmlText = String(reader.result || "");
      applyKmlContent(xmlText);
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo cargar el archivo KML");
    }
  };

  reader.onerror = () => {
    alert("No se pudo leer el archivo KML");
  };

  reader.readAsText(file);
}

async function preloadDefaultKml() {
  try {
    setLoading(true, "Cargando radares ZBE...");

    const response = await fetch(encodeURI(DEFAULT_KML_FILE));
    if (!response.ok) {
      throw new Error("No se pudo leer el KML por defecto");
    }

    const xmlText = await response.text();
    applyKmlContent(xmlText);
  } catch (error) {
    console.warn("No se pudo precargar el KML por defecto:", error.message);
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  attachSearchEvents(els.placeInput, els.placeSearchBtn, els.placeResults, (item) => {
    placeSearchMarker(item);
    hideResults(els.placeResults);
  });

  attachSearchEvents(els.originInput, els.originSearchBtn, els.originResults, (item) => {
    originPoint = {
      name: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
    };

    els.originInput.value = item.display_name;
    hideResults(els.originResults);
    placeRoutePointMarker("origin", originPoint);
  });

  attachSearchEvents(els.destinationInput, els.destinationSearchBtn, els.destinationResults, (item) => {
    destinationPoint = {
      name: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
    };

    els.destinationInput.value = item.display_name;
    hideResults(els.destinationResults);
    placeRoutePointMarker("destination", destinationPoint);
  });

  document.addEventListener("click", (event) => {
    const withinResults =
      els.placeResults.contains(event.target) ||
      els.originResults.contains(event.target) ||
      els.destinationResults.contains(event.target);

    const withinInputs =
      els.placeInput.contains(event.target) ||
      els.originInput.contains(event.target) ||
      els.destinationInput.contains(event.target);

    if (!withinResults && !withinInputs) {
      hideResults(els.placeResults);
      hideResults(els.originResults);
      hideResults(els.destinationResults);
    }
  });

  els.calculateRoutesBtn.addEventListener("click", calculateRoutes);

  els.clearRoutesBtn.addEventListener("click", () => {
    clearRoutes();
  });

  els.avoidZbeCheckbox.addEventListener("change", () => {
    if (!routesData.length) {
      return;
    }

    const ranked = getRouteRanking();
    if (els.avoidZbeCheckbox.checked && ranked.length) {
      setActiveRoute(ranked[0].id);
    } else {
      renderRoutesPanel();
    }
  });

  els.loadKmlBtn.addEventListener("click", () => {
    els.kmlFileInput.click();
  });

  els.kmlFileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".kml")) {
      alert("Selecciona un archivo .kml valido");
      return;
    }

    loadKmlFile(file);
    event.target.value = "";
  });

  els.toggleZbeLayer.addEventListener("change", () => {
    if (els.toggleZbeLayer.checked) {
      zbeLayerGroup.addTo(map);
    } else {
      map.removeLayer(zbeLayerGroup);
    }
  });

  els.myLocationBtn.addEventListener("click", toggleLiveLocationTracking);

  if (els.panelToggleBtn) {
    els.panelToggleBtn.addEventListener("click", () => {
      setSidebarOpen(!sidebarOpen);
    });
  }

  mobileQuery.addEventListener("change", syncMobileLayout);
}

initMap();
syncMobileLayout();
bindEvents();
updateZbeCounter();
preloadDefaultKml();
autoStartLiveLocationIfAllowed();
