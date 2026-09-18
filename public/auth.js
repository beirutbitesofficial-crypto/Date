const tabs = document.querySelectorAll(".tab");
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");

tabs.forEach(tab => tab.addEventListener("click", () => {
  tabs.forEach(t => t.classList.toggle("active", t === tab));
  const register = tab.dataset.tab === "register";
  forgotForm?.classList.add("hidden");
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


const forgotForm = document.getElementById("forgotForm");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");

function showForgotForm() {
  registerForm.classList.add("hidden");
  loginForm.classList.add("hidden");
  forgotForm.classList.remove("hidden");
  tabs.forEach(t => t.classList.remove("active"));
}
function showLoginForm() {
  forgotForm.classList.add("hidden");
  registerForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === "login"));
}

forgotPasswordBtn?.addEventListener("click", showForgotForm);
backToLoginBtn?.addEventListener("click", showLoginForm);

forgotForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const msg = document.getElementById("forgotMessage");
  msg.textContent = "Sending…";
  const payload = Object.fromEntries(new FormData(forgotForm).entries());
  try {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    msg.textContent = data.message || "If that email exists, a reset link has been sent.";
  } catch {
    msg.textContent = "Could not send the reset email. Please try again.";
  }
});

const query = new URLSearchParams(location.search);
if (query.get("verification") === "invalid") {
  const error = document.getElementById("loginError");
  error.textContent = "That verification link is invalid or expired. Sign in to request a new one.";
  showLoginForm();
}

if (query.get("account") === "deleted") {
  const msg = document.getElementById("registerError");
  msg.style.color = "#52775d";
  msg.textContent = "Your account and portfolio were deleted.";
}
