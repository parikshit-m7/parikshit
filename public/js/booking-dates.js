(() => {
  const form = document.getElementById("booking-form");
  if (!form) return;

  const checkIn = document.getElementById("check-in");
  const checkOut = document.getElementById("check-out");
  const rooms = document.getElementById("room-count");
  const guests = document.getElementById("guest-count");
  const nightsLabel = document.getElementById("booking-nights");
  const priceLabel = document.getElementById("booking-price");
  const depositLabel = document.getElementById("booking-deposit");
  const balanceLabel = document.getElementById("booking-balance");
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
      depositLabel.textContent = "—";
      balanceLabel.textContent = "—";
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
      depositLabel.textContent = formatINR(data.depositAmount);
      balanceLabel.textContent = formatINR(data.remainingAmount);
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
    if (typeof window.Razorpay !== "function") {
      message.textContent = "Secure payment checkout could not load. Please refresh and try again.";
      return;
    }

    if (bookButton) { bookButton.disabled = true; bookButton.textContent = "Holding rooms…"; }
    message.textContent = "Your selected rooms are being held while checkout opens.";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams(new FormData(form)),
      });
      const order = await response.json();
      if (!response.ok) throw new Error(order.error || "Could not start your booking.");

      const checkout = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Wanderlust",
        description: `${order.listingTitle} · 50% booking deposit`,
        order_id: order.orderId,
        prefill: order.user,
        notes: { booking_id: order.bookingId },
        theme: { color: "#244b3e" },
        modal: { ondismiss: () => {
          message.textContent = `Checkout closed. Your rooms are held for ${order.holdMinutes} minutes; you can retry from My trips.`;
          if (bookButton) { bookButton.disabled = false; bookButton.innerHTML = 'Try payment again <i class="fa-solid fa-arrow-right"></i>'; }
        } },
        handler: async (payment) => {
          message.textContent = "Payment received. Verifying and confirming your booking…";
          try {
            const verification = await fetch(`/bookings/${encodeURIComponent(order.bookingId)}/confirm`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify(payment),
            });
            const result = await verification.json();
            if (!verification.ok) throw new Error(result.error || "Payment verification is still pending.");
            message.classList.remove("text-danger");
            message.classList.add("text-success");
            message.textContent = "Booked! Your 50% advance is paid and your rooms are confirmed.";
            window.location.assign("/bookings");
          } catch (error) {
            message.textContent = `${error.message} Check My trips before paying again.`;
            if (bookButton) { bookButton.disabled = false; bookButton.innerHTML = 'Check booking status <i class="fa-solid fa-arrow-right"></i>'; }
          }
        },
      });
      checkout.on("payment.failed", (failure) => {
        message.textContent = failure.error?.description || `Payment failed. Your rooms are held for ${order.holdMinutes} minutes while you retry.`;
        if (bookButton) { bookButton.disabled = false; bookButton.innerHTML = 'Try payment again <i class="fa-solid fa-arrow-right"></i>'; }
      });
      checkout.open();
    } catch (error) {
      message.textContent = error.message;
      if (bookButton) { bookButton.disabled = !isAvailable; bookButton.innerHTML = 'Book now &amp; pay 50% <i class="fa-solid fa-arrow-right"></i>'; }
    }
  });
})();
