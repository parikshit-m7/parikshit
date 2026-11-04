(() => {
  const form = document.getElementById("booking-form");
  if (!form) return;

  const checkIn = document.getElementById("check-in");
  const checkOut = document.getElementById("check-out");
  const rooms = document.getElementById("room-count");
  const guests = document.getElementById("guest-count");
  const nightsLabel = document.getElementById("booking-nights");
  const priceLabel = document.getElementById("booking-price");
  const availabilityLabel = document.getElementById("booking-availability");
  const message = document.getElementById("booking-date-message");
  const bookButton = document.getElementById("book-now-button");
  const availableUrl = form.dataset.availabilityUrl;
  const formatINR = (amount) => `₹ ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)}`;
  let lookupId = 0;
  let isAvailable = false;

  const syncGuestOptions = () => {
    const maxGuests = Math.min(10, Number(rooms.value || 1) * 6);
    [...guests.options].forEach((option) => { option.disabled = Number(option.value) > maxGuests; });
    if (Number(guests.value) > maxGuests) guests.value = String(maxGuests);
  };

  const updateAvailability = async () => {
    const currentLookup = ++lookupId;
    isAvailable = false;
    if (bookButton) bookButton.disabled = true;
    message.textContent = "";
    if (!checkIn.value || !checkOut.value || checkOut.value <= checkIn.value) {
      availabilityLabel.textContent = "Choose valid dates to check rooms.";
      nightsLabel.textContent = "Select dates";
      priceLabel.textContent = `${formatINR(Number(listing.price) || 0)} / room / night`;
      return;
    }

    availabilityLabel.textContent = "Checking available rooms…";
    const params = new URLSearchParams({ checkIn: checkIn.value, checkOut: checkOut.value, rooms: rooms.value });
    try {
      const response = await fetch(`${availableUrl}?${params}`, { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (currentLookup !== lookupId) return;
      if (!response.ok) throw new Error(data.error || "Could not check room availability.");
      isAvailable = data.available;
      availabilityLabel.textContent = data.available
        ? `${data.roomsAvailable} room${data.roomsAvailable === 1 ? "" : "s"} available for these dates.`
        : `Only ${data.roomsAvailable} room${data.roomsAvailable === 1 ? " is" : "s are"} available for these dates.`;
      nightsLabel.textContent = `${data.nights} ${data.nights === 1 ? "night" : "nights"} · ${data.rooms} ${data.rooms === 1 ? "room" : "rooms"}`;
      priceLabel.textContent = `${formatINR(data.totalPrice)} total`;
      if (bookButton) bookButton.disabled = !data.available;
    } catch (error) {
      if (currentLookup !== lookupId) return;
      availabilityLabel.textContent = error.message;
      if (bookButton) bookButton.disabled = true;
    }
  };

  checkIn.addEventListener("change", () => {
    const start = new Date(`${checkIn.value}T00:00:00.000Z`);
    if (checkIn.value) checkOut.min = new Date(start.getTime() + 86400000).toISOString().slice(0, 10);
    if (checkOut.value && checkOut.value <= checkIn.value) checkOut.value = "";
    updateAvailability();
  });
  checkOut.addEventListener("change", updateAvailability);
  rooms.addEventListener("change", () => { syncGuestOptions(); updateAvailability(); });
  guests.addEventListener("change", syncGuestOptions);
  syncGuestOptions();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!isAvailable) {
      message.textContent = "Check available rooms for your dates before booking.";
      await updateAvailability();
      return;
    }
    if (bookButton) { bookButton.disabled = true; bookButton.textContent = "Confirming booking…"; }
    message.textContent = "Checking room availability and confirming your booking…";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams(new FormData(form)),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not confirm your booking.");
      message.classList.remove("text-danger");
      message.classList.add("text-success");
      message.textContent = "Booking confirmed! Opening My trips…";
      window.location.assign("/bookings");
    } catch (error) {
      message.textContent = error.message;
      if (bookButton) {
        bookButton.disabled = !isAvailable;
        bookButton.innerHTML = 'Confirm booking <i class="fa-solid fa-arrow-right"></i>';
      }
      if (error.message.includes("available")) updateAvailability();
    }
  });
})();
