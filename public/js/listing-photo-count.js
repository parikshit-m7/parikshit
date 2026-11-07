(() => {
  document.querySelectorAll(".listing-photo-input").forEach((input) => {
    const form = input.form;
    const status = input.parentElement.querySelector("[data-photo-count]");
    const existingCount = Number(input.dataset.existingCount || 0);

    const updatePhotoCount = () => {
      const total = existingCount + input.files.length;
      const remaining = Math.max(0, 5 - total);
      const message = total < 5
        ? `Select ${remaining} more photo${remaining === 1 ? "" : "s"} of this stay.`
        : total > 10
          ? "A stay can have up to 10 photos."
          : "";

      input.setCustomValidity(message);
      if (status) {
        status.textContent = input.files.length
          ? `${total} of 5 minimum photos selected.`
          : `Current photos: ${existingCount}. ${remaining ? `Add at least ${remaining} more.` : "You have enough photos."}`;
      }
    };

    input.addEventListener("change", updatePhotoCount);
    form?.addEventListener("submit", updatePhotoCount);
    updatePhotoCount();
  });
})();
