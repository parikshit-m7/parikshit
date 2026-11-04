document.addEventListener("click", async (event) => {
  const button = event.target.closest(".retry-payment");
  if (!button || typeof window.Razorpay !== "function") return;

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Opening secure payment…";
  try {
    const response = await fetch(`/bookings/${encodeURIComponent(button.dataset.bookingId)}/retry`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not reopen payment.");

    const checkout = new Razorpay({
      key: data.keyId,
      amount: data.amount,
      currency: data.currency,
      name: "Wanderlust",
      description: `50% booking deposit · ${data.listingTitle}`,
      order_id: data.orderId,
      prefill: data.user,
      notes: { bookingId: data.bookingId },
      theme: { color: "#e8785d" },
      handler: async (payment) => {
        button.textContent = "Verifying payment…";
        try {
          const verified = await fetch(`/bookings/${encodeURIComponent(data.bookingId)}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payment),
          });
          const result = await verified.json();
          if (!verified.ok || !result.ok) throw new Error(result.error || "Payment verification is still pending.");
          location.assign("/bookings");
        } catch (error) {
          alert(`${error.message} Please check My trips in a moment.`);
          button.disabled = false;
          button.textContent = originalText;
        }
      },
      modal: { ondismiss: () => { button.disabled = false; button.textContent = originalText; } },
    });
    checkout.on("payment.failed", (event) => {
      alert(event.error?.description || "Payment failed. Your room hold is still active until it expires.");
      button.disabled = false;
      button.textContent = originalText;
    });
    checkout.open();
  } catch (error) {
    alert(error.message);
    button.disabled = false;
    button.textContent = originalText;
  }
});
