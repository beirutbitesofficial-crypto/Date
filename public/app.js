let state = { user: null, projects: [], config: null };
let editingProjectId = null;
let googleTokenClient = null;
let googlePickerReady = false;

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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m]));
}

function val(name, value = "") {
  const input = document.querySelector(`#profileForm [name="${name}"]`);
  if (!input) return;
  if (input.type === "checkbox") input.checked = Boolean(value);
  else input.value = value ?? "";
}

function projectVal(name, value = "") {
  const input = document.querySelector(`#projectForm [name="${name}"]`);
  if (!input) return;
  if (input.type === "checkbox") input.checked = Boolean(value);
  else input.value = value ?? "";
}

function profileCompletion(user) {
  const p = user.profile || {};
  const items = [
    p.fullName, p.position, p.discipline, p.bio,
    p.location, (p.skills || []).length, (p.services || []).length,
    p.avatarUrl, p.contactEmail || p.phone || Object.values(p.social || {}).some(Boolean)
  ];
  return Math.round(items.filter(Boolean).length / items.length * 100);
}

function populate() {
  const u = state.user;
  const p = u.profile || {};
  document.getElementById("sideName").textContent = p.fullName || "Your profile";
  document.getElementById("sideRole").textContent = p.position || p.discipline || "Freelancer";

  const avatar = document.getElementById("sideAvatar");
  avatar.innerHTML = p.avatarUrl ? `<img src="${p.avatarUrl}" alt="">` : escapeHtml((p.fullName || "F").charAt(0).toUpperCase());

  document.getElementById("helloTitle").textContent = `Good to see you, ${(p.fullName || "there").split(" ")[0]}.`;
  document.getElementById("completionStat").textContent = profileCompletion(u) + "%";
  document.getElementById("projectsStat").textContent = state.projects.filter(x => x.published !== false).length;
  document.getElementById("projectsStat").nextElementSibling.textContent = "published work";
  document.getElementById("onboardingBanner").classList.toggle("hidden", u.onboardingComplete);

  const profileReady = u.onboardingComplete;
  const isPublic = profileReady && p.portfolioPublic !== false;
  document.getElementById("linkStatus").textContent = !profileReady ? "Not ready" : (isPublic ? "Live" : "Private");
  document.getElementById("linkHint").textContent = profileReady ? "/u/" + u.slug : "finish profile";

  document.getElementById("checkProfile").textContent = (profileReady ? "✓" : "○") + " Professional profile completed";
  document.getElementById("checkBio").textContent = (p.bio ? "✓" : "○") + " Clear bio and positioning";
  document.getElementById("checkSkills").textContent = ((p.skills || []).length && (p.services || []).length ? "✓" : "○") + " Skills and services added";
  document.getElementById("checkWork").textContent = (state.projects.length >= 3 ? "✓" : "○") + " At least 3 projects uploaded";

  val("fullName", p.fullName);
  val("slug", u.slug);
  val("position", p.position);
  val("discipline", p.discipline);
  val("birthday", p.birthday);
  val("showBirthday", p.showBirthday);
  val("location", p.location);
  val("experienceYears", p.experienceYears);
  val("bio", p.bio);
  val("skills", (p.skills || []).join(", "));
  val("services", (p.services || []).join(", "));
  val("languages", (p.languages || []).join(", "));
  val("phone", p.phone);
  val("contactEmail", p.contactEmail || "");
  val("showContactEmail", p.showContactEmail !== false);
  val("availableForWork", p.availableForWork !== false);
  val("portfolioPublic", p.portfolioPublic !== false);
  val("accent", p.accent || "#111111");
  Object.entries(p.social || {}).forEach(([k, v]) => val(k, v));

  const url = location.origin + "/u/" + u.slug;
  document.getElementById("publicUrl").textContent = profileReady ? url : "Complete your profile first";
  document.getElementById("previewLink").href = profileReady ? "/u/" + u.slug : "#";
  document.getElementById("openBtn").href = profileReady ? "/u/" + u.slug : "#";
  document.getElementById("previewLink").style.opacity = profileReady ? "1" : ".5";
  document.getElementById("openBtn").style.opacity = profileReady ? "1" : ".5";

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
    const visual = first
      ? first.type === "video"
        ? `<video src="${first.url}" muted preload="metadata"></video>`
        : `<img src="${first.url}" alt="">`
      : source
        ? `<div class="source-thumb"><b>${escapeHtml(source.platform || "External")}</b><small>Imported project source</small></div>`
        : '<div class="project-placeholder">No media</div>';

    return `<article class="project-admin-card">
      <div class="project-thumb">${visual}<span>${escapeHtml(project.category || source?.platform || "Project")}</span></div>
      <div class="project-admin-body">
        <div>
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.client || project.year || "")}</p>
          <small class="publish-state ${project.published === false ? "draft" : ""}">${project.published === false ? "Draft / hidden" : "Published"}</small>
        </div>
        <div class="project-card-actions">
          <button class="icon-btn edit-project" data-id="${project.id}" aria-label="Edit project">✎</button>
          <button class="icon-btn delete-project" data-id="${project.id}" aria-label="Delete project">×</button>
        </div>
      </div>
    </article>`;
  }).join("");

  document.querySelectorAll(".edit-project").forEach(btn => btn.addEventListener("click", () => beginEditProject(btn.dataset.id)));
  document.querySelectorAll(".delete-project").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Delete this project and its uploaded media?")) return;
    const response = await fetch("/api/projects/" + btn.dataset.id, { method: "DELETE" });
    if (response.ok) {
      state.projects = state.projects.filter(p => p.id !== btn.dataset.id);
      if (editingProjectId === btn.dataset.id) resetProjectForm();
      populate();
    }
  }));
}

function beginEditProject(id) {
  const project = state.projects.find(p => p.id === id);
  if (!project) return;
  editingProjectId = id;
  const form = document.getElementById("projectForm");

  projectVal("title", project.title);
  projectVal("category", project.category);
  projectVal("client", project.client);
  projectVal("year", project.year);
  projectVal("description", project.description);
  projectVal("tools", (project.tools || []).join(", "));
  projectVal("projectUrl", project.projectUrl);
  projectVal("sourceLinks", (project.externalSources || []).map(x => x.url).join("\n"));
  projectVal("featured", project.featured);
  projectVal("published", project.published !== false);

  document.getElementById("projectSubmitBtn").textContent = "Save changes →";
  document.getElementById("cancelEditBtn").classList.remove("hidden");
  document.getElementById("projectMessage").textContent = "Editing “" + project.title + "”";
  showSection("work");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProjectForm() {
  editingProjectId = null;
  const form = document.getElementById("projectForm");
  form.reset();
  form.published.checked = true;
  document.getElementById("projectSubmitBtn").textContent = "Add project →";
  document.getElementById("cancelEditBtn").classList.add("hidden");
  document.getElementById("projectMessage").textContent = "";
  document.getElementById("fileSummary").textContent = "No files selected";
  setUploadProgress(null);
}

document.getElementById("cancelEditBtn").addEventListener("click", resetProjectForm);

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return (mb >= 10 ? Math.round(mb) : mb.toFixed(1)) + " MB";
}

document.getElementById("projectMediaInput").addEventListener("change", e => {
  const files = [...e.target.files];
  if (!files.length) {
    document.getElementById("fileSummary").textContent = "No files selected";
    return;
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  document.getElementById("fileSummary").textContent = `${files.length} file${files.length > 1 ? "s" : ""} · ${formatBytes(total)}`;
});

function validateProjectFiles(files) {
  const maxMb = Number(state.config?.maxUploadMb || 250);
  if (files.length > 8) return "Maximum 8 files per upload.";
  const tooLarge = files.find(file => file.size > maxMb * 1024 * 1024);
  if (tooLarge) return `${tooLarge.name} is larger than ${maxMb}MB.`;
  return "";
}

function setUploadProgress(percent, label = "Uploading files…") {
  const wrap = document.getElementById("projectUploadProgress");
  if (percent === null) {
    wrap.classList.add("hidden");
    document.getElementById("uploadProgressBar").style.width = "0%";
    document.getElementById("uploadProgressPercent").textContent = "0%";
    return;
  }
  wrap.classList.remove("hidden");
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  document.getElementById("uploadProgressBar").style.width = safe + "%";
  document.getElementById("uploadProgressPercent").textContent = safe + "%";
  document.getElementById("uploadProgressLabel").textContent = label;
}

function xhrForm(url, method, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.responseType = "json";

    xhr.upload.onprogress = event => {
      if (event.lengthComputable && onProgress) onProgress((event.loaded / event.total) * 100);
    };
    xhr.upload.onload = () => {
      if (onProgress) onProgress(100, true);
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please try again."));
    xhr.onload = () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || "Request failed."));
    };
    xhr.send(formData);
  });
}

document.getElementById("profileForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = document.getElementById("profileMessage");
  const submit = form.querySelector('button[type="submit"]');
  const fd = new FormData(form);
  fd.set("showBirthday", form.showBirthday.checked ? "true" : "false");
  fd.set("showContactEmail", form.showContactEmail.checked ? "true" : "false");
  fd.set("availableForWork", form.availableForWork.checked ? "true" : "false");
  fd.set("portfolioPublic", form.portfolioPublic.checked ? "true" : "false");

  submit.disabled = true;
  msg.textContent = "Saving…";
  try {
    const data = await xhrForm("/api/profile", "PUT", fd, (pct, done) => {
      msg.textContent = done ? "Processing…" : "Uploading profile photo " + Math.round(pct) + "%";
    });
    state.user = data.user;
    msg.textContent = "Saved ✓";
    populate();
    setTimeout(() => showSection("overview"), 450);
  } catch (error) {
    msg.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("projectForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = document.getElementById("projectMessage");
  const submit = document.getElementById("projectSubmitBtn");
  const files = [...form.media.files];
  const validation = validateProjectFiles(files);
  if (validation) {
    msg.textContent = validation;
    return;
  }

  const fd = new FormData(form);
  fd.set("featured", form.featured.checked ? "true" : "false");
  fd.set("published", form.published.checked ? "true" : "false");

  submit.disabled = true;
  msg.textContent = files.length ? "Preparing upload…" : "Saving project…";
  if (files.length) setUploadProgress(0);

  try {
    const method = editingProjectId ? "PUT" : "POST";
    const url = editingProjectId ? "/api/projects/" + editingProjectId : "/api/projects";
    const data = await xhrForm(url, method, fd, (pct, done) => {
      if (!files.length) return;
      setUploadProgress(pct, done ? "Upload complete · processing securely…" : "Uploading files…");
      msg.textContent = done ? "Processing securely…" : "Uploading " + Math.round(pct) + "%";
    });

    if (editingProjectId) {
      state.projects = state.projects.map(p => p.id === editingProjectId ? data.project : p);
      msg.textContent = "Project updated ✓";
    } else {
      state.projects.unshift(data.project);
      msg.textContent = "Project added ✓";
    }
    resetProjectForm();
    populate();
  } catch (error) {
    msg.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("copyBtn").addEventListener("click", async () => {
  if (!state.user.onboardingComplete) return;
  const url = location.origin + "/u/" + state.user.slug;
  await navigator.clipboard.writeText(url);
  const btn = document.getElementById("copyBtn");
  btn.textContent = "Copied ✓";
  setTimeout(() => btn.textContent = "Copy link", 1600);
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/";
});

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function initGoogleDrive() {
  const btn = document.getElementById("connectDriveBtn");
  const help = document.getElementById("driveHelp");
  const cfg = state.config?.googleDrive;

  if (!cfg?.enabled) {
    btn.disabled = true;
    btn.textContent = "Google Drive not configured";
    help.textContent = "Drive Picker is ready in the code but needs GOOGLE_CLIENT_ID, GOOGLE_API_KEY and GOOGLE_APP_ID on the server.";
    return;
  }

  try {
    await Promise.all([
      loadScript("https://apis.google.com/js/api.js"),
      loadScript("https://accounts.google.com/gsi/client")
    ]);

    await new Promise((resolve, reject) => {
      if (!window.gapi) return reject(new Error("Google API failed to load."));
      window.gapi.load("picker", { callback: resolve, onerror: reject, timeout: 10000, ontimeout: () => reject(new Error("Google Picker timed out.")) });
    });

    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: () => {}
    });
    googlePickerReady = true;
    btn.disabled = false;
    btn.textContent = "Connect Google Drive";
  } catch (error) {
    btn.disabled = true;
    btn.textContent = "Drive unavailable";
    help.textContent = "Could not load Google Drive Picker. You can still paste a Drive link manually.";
    console.error(error);
  }
}

function openGooglePicker(accessToken) {
  const cfg = state.config.googleDrive;
  const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setIncludeFolders(false)
    .setSelectFolderEnabled(false)
    .setMode(google.picker.DocsViewMode.LIST);

  const picker = new google.picker.PickerBuilder()
    .setAppId(cfg.appId)
    .setDeveloperKey(cfg.apiKey)
    .setOAuthToken(accessToken)
    .addView(docsView)
    .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
    .setCallback(data => {
      const action = data[google.picker.Response.ACTION];
      if (action !== google.picker.Action.PICKED) return;

      const docs = data[google.picker.Response.DOCUMENTS] || [];
      const textarea = document.querySelector('#projectForm [name="sourceLinks"]');
      const current = textarea.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const selected = docs.map(doc => {
        const url = doc[google.picker.Document.URL] || doc.url;
        const id = doc[google.picker.Document.ID] || doc.id;
        return url || (id ? "https://drive.google.com/open?id=" + encodeURIComponent(id) : "");
      }).filter(Boolean);

      textarea.value = [...new Set([...current, ...selected])].join("\n");
      document.getElementById("driveHelp").textContent = `${selected.length} Drive item${selected.length === 1 ? "" : "s"} added. Make sure visitors have permission to preview them.`;
    })
    .build();

  picker.setVisible(true);
}

document.getElementById("connectDriveBtn").addEventListener("click", () => {
  if (!googlePickerReady || !googleTokenClient) return;
  const btn = document.getElementById("connectDriveBtn");
  btn.disabled = true;
  btn.textContent = "Connecting…";

  googleTokenClient.callback = response => {
    btn.disabled = false;
    btn.textContent = "Connect Google Drive";
    if (response.error) {
      document.getElementById("driveHelp").textContent = "Google authorization was cancelled or failed.";
      return;
    }
    openGooglePicker(response.access_token);
  };

  googleTokenClient.requestAccessToken({ prompt: "" });
});

async function load() {
  const [meResponse, configResponse] = await Promise.all([
    fetch("/api/me"),
    fetch("/api/config")
  ]);

  if (meResponse.status === 401) return location.href = "/";
  const data = await meResponse.json();
  const config = configResponse.ok ? await configResponse.json() : {};

  state.user = data.user;
  state.projects = data.projects || [];
  state.config = config;

  document.getElementById("loading").classList.add("hidden");
  populate();
  showSection(state.user.onboardingComplete ? "overview" : "profile");
  initGoogleDrive();
}

load().catch(error => {
  console.error(error);
  document.getElementById("loading").textContent = "Could not load your workspace. Please refresh.";
});
