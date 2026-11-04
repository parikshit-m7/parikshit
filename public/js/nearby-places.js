(() => {
  const section = document.getElementById("nearby-explore");
  const list = document.getElementById("nearby-place-grid");
  const status = document.getElementById("nearby-status");
  if (!section || !list || !status) return;

  const labels = { food: "Food & dining", sights: "Places to visit", rail: "Railway", bus: "Bus", airport: "Airport" };
  let places = [];
  let activeCategory = "all";

  const render = () => {
    const visible = places.filter((place) => activeCategory === "all" || place.category === activeCategory);
    list.replaceChildren();
    if (!visible.length && places.length) {
      status.textContent = activeCategory === "all" ? "No nearby places were found in this area." : `No ${labels[activeCategory]?.toLowerCase()} found nearby.`;
      return;
    }
    if (!places.length) return;
    status.textContent = `${visible.length} nearby ${visible.length === 1 ? "place" : "places"}, sorted by distance`;
    for (const place of visible) {
      const card = document.createElement("article");
      card.className = "nearby-place-card";
      const heading = document.createElement("strong");
      heading.textContent = place.name;
      const category = document.createElement("span");
      category.textContent = place.cuisine ? `${labels[place.category]} · ${place.cuisine}` : labels[place.category];
      const distance = document.createElement("span");
      distance.className = "nearby-distance";
      distance.textContent = place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m away` : `${place.distanceKm.toFixed(1)} km away`;
      const link = document.createElement("a");
      link.href = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Directions";
      card.append(heading, category, distance, link);
      list.append(card);
    }
  };

  section.querySelectorAll("[data-nearby-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.nearbyCategory;
      section.querySelectorAll("[data-nearby-category]").forEach((tab) => {
        const selected = tab === button;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-pressed", String(selected));
      });
      render();
    });
  });

  fetch(section.dataset.url, { headers: { Accept: "application/json" } })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Nearby places could not be loaded.");
      places = data.places || [];
      render();
      const attribution = document.getElementById("nearby-attribution");
      if (attribution) attribution.textContent = `Place data © ${data.attribution || "OpenStreetMap contributors"}`;
    })
    .catch((error) => { status.textContent = error.message; });
})();
