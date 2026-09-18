const form = document.getElementById("resetPasswordForm");
const message = document.getElementById("resetMessage");
const token = new URLSearchParams(location.search).get("token") || "";

form.addEventListener("submit", async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());

  if (!token) {
    message.textContent = "This reset link is invalid.";
    return;
  }
  if (values.password !== values.confirmPassword) {
    message.textContent = "Passwords do not match.";
    return;
  }

  message.textContent = "Updating password…";
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;

  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: values.password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not reset password.");
    message.textContent = "Password updated ✓ Redirecting…";
    setTimeout(() => { location.href = "/app"; }, 700);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
