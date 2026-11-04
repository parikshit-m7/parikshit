(() => {
  const form = document.getElementById("booking-form");
  if (!form) return;
  const checkIn = document.getElementById("check-in");
  const checkOut = document.getElementById("check-out");
  const nightsLabel = document.getElementById("booking-nights");
  const priceLabel = document.getElementById("booking-price");
  const message = document.getElementById("booking-date-message");
  const blocked = unavailableRanges || [];
  const nightlyRate = Number(listing.price) || 0;
  const dateValue = (input) => input.value ? new Date(`${input.value}T00:00:00.000Z`).getTime() : NaN;
  const formatINR = (amount) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);

  const validateDates = () => {
    const start = dateValue(checkIn);
    const end = dateValue(checkOut);
    checkOut.min = checkIn.value || checkOut.min;
    let conflict = false;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      conflict = blocked.some((range) => start < Date.parse(`${range.end}T00:00:00.000Z`) && end > Date.parse(`${range.start}T00:00:00.000Z`));
    }
    checkIn.setCustomValidity("");
    checkOut.setCustomValidity(conflict ? "These dates overlap with an existing booking request." : "");
    message.textContent = conflict ? "Some selected dates are already requested. Please choose another range." : "";
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && !conflict) {
      const nights = (end - start) / 86400000;
      nightsLabel.textContent = `${nights} ${nights === 1 ? "night" : "nights"}`;
      priceLabel.textContent = `₹ ${formatINR(nightlyRate * nights)} total`;
    } else {
      nightsLabel.textContent = "Select dates to see total";
      priceLabel.textContent = `₹ ${formatINR(nightlyRate)} / night`;
    }
  };

  checkIn.addEventListener("change", () => {
    const start = dateValue(checkIn);
    const nextDay = Number.isFinite(start) ? new Date(start + 86400000).toISOString().slice(0, 10) : checkIn.min;
    checkOut.min = nextDay;
    if (checkOut.value && dateValue(checkOut) <= start) checkOut.value = "";
    validateDates();
  });
  checkOut.addEventListener("change", validateDates);
  form.addEventListener("submit", (event) => {
    validateDates();
    if (!form.reportValidity() || message.textContent) {
      event.preventDefault();
      if (message.textContent) checkOut.focus();
    }
  });
})();
