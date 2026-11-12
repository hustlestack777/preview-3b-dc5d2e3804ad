(function () {
  const credit = document.getElementById("lrl-credit");
  const modal = document.getElementById("lrl-modal");
  const form = document.getElementById("lrl-form");
  const thanks = document.getElementById("lrl-thanks");
  const errorEl = document.getElementById("lrl-error");
  const submit = document.getElementById("lrl-submit");
  if (!credit || !modal || !form) return;

  const firstField = form.querySelector("input, select, textarea");

  function open() {
    thanks.hidden = true;
    form.hidden = false;
    errorEl.hidden = true;
    errorEl.textContent = "";
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    (firstField || submit)?.focus();
  }

  function close() {
    modal.hidden = true;
    document.body.style.overflow = "";
    credit.focus();
  }

  credit.addEventListener("click", open);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-lrl-close]")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    submit.textContent = "Sending…";
    errorEl.hidden = true;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/lrl-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name") || "",
          phone: data.get("phone") || "",
          email: data.get("email") || "",
          business: data.get("organization") || "",
          topic: data.get("topic") || "",
          reachTime: data.get("reachTime") || "",
          comment: data.get("comment") || "",
          sourceSite: "3 B's Tree Removal",
          sourcePage: window.location.href,
          company_fax: data.get("company_fax") || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        errorEl.textContent = payload?.error || "We couldn't send that. Please try again.";
        errorEl.hidden = false;
        submit.disabled = false;
        submit.textContent = "Send to Shaun";
        return;
      }
      form.reset();
      form.hidden = true;
      thanks.hidden = false;
      document.getElementById("lrl-thanks-title")?.focus();
    } catch {
      errorEl.textContent = "We couldn't send that. Please try again.";
      errorEl.hidden = false;
      submit.disabled = false;
      submit.textContent = "Send to Shaun";
    }
  });
})();
