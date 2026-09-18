let state = { user: null, projects: [] };

const sections = {
  overview: document.getElementById("overviewSection"),
  profile: document.getElementById("profileSection"),
  work: document.getElementById("workSection"),
  share: document.getElementById("shareSection")
};

function showSection(name) {
  Object.entries(sections).forEach(([key, el]) => el.classList.toggle("hidden", key !== name));
  document.querySelectorAll(".side-link").forEach(btn => btn.classList.toggle("active", btn.dataset.section === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-section]").forEach(btn => btn.addEventListener("click", () => showSection(btn.dataset.section)));
document.addEventListener("click", e => {
  const go = e.target.closest("[data-go]");
  if (go) showSection(go.dataset.go);
});

function val(name, value = "") {
  const input = document.querySelector(`#profileForm [name="${name}"]`);
  if (!input) return;
  if (input.type === "checkbox") input.checked = Boolean(value);
  else input.value = value ?? "";
}

function profileCompletion(user) {
  const p = user.profile || {};
  const items = [
    p.fullName, p.position, p.discipline, p.bio,
    p.location, (p.skills || []).length, (p.services || []).length,
    p.avatarUrl, p.phone || Object.values(p.social || {}).some(Boolean)
  ];
  return Math.round(items.filter(Boolean).length / items.length * 100);
}

function populate() {
  const u = state.user;
  const p = u.profile || {};
  document.getElementById("sideName").textContent = p.fullName || "Your profile";
  document.getElementById("sideRole").textContent = p.position || p.discipline || "Freelancer";
  const avatar = document.getElementById("sideAvatar");
  avatar.innerHTML = p.avatarUrl ? `<img src="${p.avatarUrl}" alt="">` : (p.fullName || "F").charAt(0).toUpperCase();

  document.getElementById("helloTitle").textContent = `Good to see you, ${(p.fullName || "there").split(" ")[0]}.`;
  document.getElementById("completionStat").textContent = profileCompletion(u) + "%";
  document.getElementById("projectsStat").textContent = state.projects.length;
  document.getElementById("projectsStat").nextElementSibling.textContent = state.projects.length === 1 ? "published project" : "published work";
  document.getElementById("onboardingBanner").classList.toggle("hidden", u.onboardingComplete);

  const ready = u.onboardingComplete;
  document.getElementById("linkStatus").textContent = ready ? "Live" : "Not ready";
  document.getElementById("linkHint").textContent = ready ? "/u/" + u.slug : "finish profile";

  document.getElementById("checkProfile").textContent = (ready ? "✓" : "○") + " Professional profile completed";
  document.getElementById("checkBio").textContent = (p.bio ? "✓" : "○") + " Clear bio and positioning";
  document.getElementById("checkSkills").textContent = ((p.skills || []).length && (p.services || []).length ? "✓" : "○") + " Skills and services added";
  document.getElementById("checkWork").textContent = (state.projects.length >= 3 ? "✓" : "○") + " At least 3 projects uploaded";

  val("fullName", p.fullName); val("slug", u.slug); val("position", p.position);
  val("discipline", p.discipline); val("birthday", p.birthday); val("showBirthday", p.showBirthday);
  val("location", p.location); val("experienceYears", p.experienceYears); val("bio", p.bio);
  val("skills", (p.skills || []).join(", ")); val("services", (p.services || []).join(", "));
  val("languages", (p.languages || []).join(", ")); val("phone", p.phone);
  val("availableForWork", p.availableForWork !== false); val("accent", p.accent || "#111111");
  Object.entries(p.social || {}).forEach(([k, v]) => val(k, v));

  const url = location.origin + "/u/" + u.slug;
  document.getElementById("publicUrl").textContent = ready ? url : "Complete your profile first";
  document.getElementById("previewLink").href = ready ? "/u/" + u.slug : "#";
  document.getElementById("openBtn").href = ready ? "/u/" + u.slug : "#";
  document.getElementById("previewLink").style.opacity = ready ? "1" : ".5";
  document.getElementById("openBtn").style.opacity = ready ? "1" : ".5";
  renderProjects();
}

function renderProjects() {
  const grid = document.getElementById("projectsGrid");
  document.getElementById("projectCount").textContent = state.projects.length + (state.projects.length === 1 ? " project" : " projects");
  if (!state.projects.length) {
    grid.innerHTML = '<div class="empty-state"><b>No projects yet.</b><p>Add your strongest piece first.</p></div>';
    return;
  }
  grid.innerHTML = state.projects.map(project => {
    const first = project.media?.[0];
    const source = project.externalSources?.[0];
    const media = first
      ? first.type === "video"
        ? `<video src="${first.url}" muted preload="metadata"></video>`
        : `<img src="${first.url}" alt="">`
      : source
        ? `<div class="source-thumb"><b>${escapeHtml(source.platform || "External")}</b><small>Imported project source</small></div>`
        : '<div class="project-placeholder">No media</div>';
    return `<article class="project-admin-card">
      <div class="project-thumb">${media}<span>${escapeHtml(project.category || source?.platform || "Project")}</span></div>
      <div class="project-admin-body"><div><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.client || project.year || "")}</p></div>
      <button class="icon-btn delete-project" data-id="${project.id}" aria-label="Delete project">×</button></div>
    </article>`;
  }).join("");

  document.querySelectorAll(".delete-project").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Delete this project?")) return;
    const response = await fetch("/api/projects/" + btn.dataset.id, { method: "DELETE" });
    if (response.ok) {
      state.projects = state.projects.filter(p => p.id !== btn.dataset.id);
      populate();
    }
  }));
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m]));
}

async function load() {
  const response = await fetch("/api/me");
  if (response.status === 401) return location.href = "/";
  const data = await response.json();
  state = data;
  document.getElementById("loading").classList.add("hidden");
  populate();
  showSection(state.user.onboardingComplete ? "overview" : "profile");
}

document.getElementById("profileForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = document.getElementById("profileMessage");
  msg.textContent = "Saving…";
  const fd = new FormData(e.currentTarget);
  fd.set("showBirthday", e.currentTarget.showBirthday.checked ? "true" : "false");
  fd.set("availableForWork", e.currentTarget.availableForWork.checked ? "true" : "false");
  const response = await fetch("/api/profile", { method: "PUT", body: fd });
  const data = await response.json();
  if (!response.ok) return msg.textContent = data.error || "Could not save profile.";
  state.user = data.user;
  msg.textContent = "Saved ✓";
  populate();
  setTimeout(() => showSection("overview"), 500);
});

document.getElementById("projectForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = document.getElementById("projectMessage");
  msg.textContent = "Uploading…";
  const fd = new FormData(e.currentTarget);
  fd.set("featured", e.currentTarget.featured.checked ? "true" : "false");
  const response = await fetch("/api/projects", { method: "POST", body: fd });
  const data = await response.json();
  if (!response.ok) return msg.textContent = data.error || "Could not add project.";
  state.projects.unshift(data.project);
  e.currentTarget.reset();
  msg.textContent = "Project added ✓";
  populate();
});

document.getElementById("copyBtn").addEventListener("click", async () => {
  if (!state.user.onboardingComplete) return;
  const url = location.origin + "/u/" + state.user.slug;
  await navigator.clipboard.writeText(url);
  document.getElementById("copyBtn").textContent = "Copied ✓";
  setTimeout(() => document.getElementById("copyBtn").textContent = "Copy link", 1600);
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/";
});

load();
