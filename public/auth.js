const tabs = document.querySelectorAll(".tab");
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");

tabs.forEach(tab => tab.addEventListener("click", () => {
  tabs.forEach(t => t.classList.toggle("active", t === tab));
  const register = tab.dataset.tab === "register";
  registerForm.classList.toggle("hidden", !register);
  loginForm.classList.toggle("hidden", register);
}));

async function submitForm(form, endpoint, errorEl) {
  errorEl.textContent = "";
  const payload = Object.fromEntries(new FormData(form).entries());
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    errorEl.textContent = data.error || "Something went wrong.";
    return;
  }
  location.href = "/app";
}

registerForm.addEventListener("submit", e => {
  e.preventDefault();
  submitForm(registerForm, "/api/auth/register", document.getElementById("registerError"));
});
loginForm.addEventListener("submit", e => {
  e.preventDefault();
  submitForm(loginForm, "/api/auth/login", document.getElementById("loginError"));
});
