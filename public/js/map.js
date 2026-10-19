// The map is optional: old listings may not have usable coordinates yet.
const coordinates = listing?.geometry?.coordinates;
const mapContainer = document.getElementById("map");

if (
  mapContainer &&
  typeof mapToken === "string" &&
  mapToken.length > 0 &&
  Array.isArray(coordinates) &&
  coordinates.length === 2 &&
  coordinates.every(Number.isFinite)
) {
  mapboxgl.accessToken = mapToken;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: coordinates,
    zoom: 10
  });

  const safeTitle = String(listing.title || "Your stay")
    .replace(/[&<>"]/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    })[character]);

  new mapboxgl.Marker({ color: "#244b3e" })
    .setLngLat(coordinates)
    .setPopup(
      new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<strong>${safeTitle}</strong><p>Approximate location</p>`
      )
    )
    .addTo(map);
} else if (mapContainer) {
  mapContainer.innerHTML =
    '<p class="text-muted p-3">Map location is not available for this stay yet.</p>';
}
