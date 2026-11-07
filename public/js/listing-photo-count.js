(() => {
  document.querySelectorAll(".listing-photo-input").forEach((input) => {
    const form = input.form;
    const status = input.parentElement.querySelector("[data-photo-count]");
    const existingCount = Number(input.dataset.existingCount || 0);
    const sampleGallery = input.dataset.sampleGallery === "true";

    const updatePhotoCount = () => {
      const keepSampleGallery = sampleGallery && input.files.length === 0;
      const total = (keepSampleGallery ? 5 : existingCount) + input.files.length;
      const remaining = Math.max(0, 5 - total);
      const message = keepSampleGallery
        ? ""
        : total < 5
        ? `Select ${remaining} more photo${remaining === 1 ? "" : "s"} of this stay.`
        : total > 10
          ? "A stay can have up to 10 photos."
          : "";

      input.setCustomValidity(message);
      if (status) {
        status.textContent = sampleGallery
          ? input.files.length
            ? `${input.files.length} real photos selected to replace the sample gallery.`
            : "Sample hotel photos are shown. Upload 5 real photos to replace them, or keep these for testing."
          : input.files.length
            ? `${total} of 5 minimum photos selected.`
            : `Current photos: ${existingCount}. ${remaining ? `Add at least ${remaining} more.` : "You have enough photos."}`;
      }
    };

    input.addEventListener("change", updatePhotoCount);
    form?.addEventListener("submit", updatePhotoCount);
    updatePhotoCount();
  });
})();
