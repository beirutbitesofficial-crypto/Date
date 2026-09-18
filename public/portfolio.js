function esc(value) {
  return String(value || "").replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m]));
}
function safeUrl(url) {
  const value = String(url || "").trim();
  return /^https?:\/\//i.test(value) ? value : "";
}
function socialLabel(key) {
  return ({ website:"Website", instagram:"Instagram", linkedin:"LinkedIn", behance:"Behance", dribbble:"Dribbble", github:"GitHub", youtube:"YouTube", vimeo:"Vimeo", figma:"Figma", canva:"Canva", notion:"Notion", tiktok:"TikTok" })[key] || key;
}
function renderExternalSource(source) {
  const url = safeUrl(source?.url);
  const embed = safeUrl(source?.embedUrl);
  const platform = esc(source?.platform || "External");

  if (embed && ["video", "drive"].includes(source?.kind)) {
    return `<iframe src="${embed}" title="${platform} project" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  }
  if (embed && source?.kind === "video-file") {
    return `<video src="${embed}" controls playsinline preload="metadata"></video>`;
  }
  if (embed && source?.kind === "image-file") {
    return `<img src="${embed}" alt="${platform} project" loading="lazy">`;
  }
  if (url) {
    return `<a class="external-project-card" href="${url}" target="_blank" rel="noopener"><span>${platform}</span><b>Open project ↗</b></a>`;
  }
  return '<div class="portfolio-placeholder"></div>';
}

async function loadPortfolio() {
  const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const response = await fetch("/api/public/" + encodeURIComponent(slug));
  const data = await response.json();
  if (!response.ok) {
    document.getElementById("portfolioLoading").innerHTML = '<div class="not-found"><h1>Portfolio not found.</h1><a href="/">Create yours →</a></div>';
    return;
  }

  const u = data.user;
  const p = u.profile || {};
  document.documentElement.style.setProperty("--accent", p.accent || "#111111");
  document.title = (p.fullName || "Portfolio") + " — " + (p.position || p.discipline || "Freelancer");

  document.getElementById("pNameNav").textContent = p.fullName || "Portfolio";
  document.getElementById("pKicker").textContent = (p.discipline || "Freelancer").toUpperCase();
  document.getElementById("pName").textContent = p.fullName || "";
  document.getElementById("pPosition").textContent = p.position || p.discipline || "";
  document.getElementById("pLocation").textContent = p.location || "";
  document.getElementById("pAvailability").innerHTML = p.availableForWork ? '<span class="availability-dot"></span> Available for freelance work' : "Currently booked";
  document.getElementById("pBio").textContent = p.bio || "";
  document.getElementById("pExperience").textContent = p.experienceYears || "—";
  document.getElementById("pLanguages").textContent = (p.languages || []).join(" · ") || "—";
  if (p.showBirthday && p.birthday) {
    const birthday = new Date(p.birthday + "T00:00:00");
    document.getElementById("pBirthday").textContent = Number.isNaN(birthday.getTime())
      ? p.birthday
      : birthday.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    document.getElementById("pBirthdayWrap").classList.remove("hidden");
  }
  document.getElementById("pSkills").innerHTML = (p.skills || []).map(x => `<span>${esc(x)}</span>`).join("");
  document.getElementById("pServices").innerHTML = (p.services || []).map(x => `<span>${esc(x)}</span>`).join("");
  document.getElementById("pFooterName").textContent = "© " + new Date().getFullYear() + " " + (p.fullName || "");

  const avatar = document.getElementById("pAvatar");
  avatar.innerHTML = p.avatarUrl ? `<img src="${p.avatarUrl}" alt="${esc(p.fullName)}">` : `<span>${esc((p.fullName || "F").charAt(0))}</span>`;

  const projects = [...data.projects].sort((a,b) => Number(b.featured) - Number(a.featured));
  const projectEl = document.getElementById("pProjects");
  if (!projects.length) {
    projectEl.innerHTML = '<div class="portfolio-empty">Work coming soon.</div>';
  } else {
    projectEl.innerHTML = projects.map((project, index) => {
      const first = project.media?.[0];
      const sources = project.externalSources || [];
      const mainSource = !first ? sources[0] : null;
      const mainMedia = first
        ? first.type === "video"
          ? `<video src="${first.url}" controls playsinline preload="metadata"></video>`
          : `<img src="${first.url}" alt="${esc(project.title)}" loading="lazy">`
        : mainSource
          ? renderExternalSource(mainSource)
          : '<div class="portfolio-placeholder"></div>';

      const extraUploads = (project.media || []).slice(1, 3).map(media =>
        media.type === "video"
          ? `<video src="${media.url}" controls playsinline preload="metadata"></video>`
          : `<img src="${media.url}" alt="" loading="lazy">`
      );
      const sourceStart = first ? 0 : (mainSource ? 1 : 0);
      const extraSources = sources.slice(sourceStart, sourceStart + Math.max(0, 2 - extraUploads.length)).map(renderExternalSource);
      const extra = [...extraUploads, ...extraSources].join("");

      const link = safeUrl(project.projectUrl);
      return `<article class="portfolio-project">
        <div class="project-index">0${index + 1}</div>
        <div class="portfolio-project-media ${extra ? "has-extra" : ""}">
          <div class="main-media">${mainMedia}</div>
          ${extra ? `<div class="extra-media">${extra}</div>` : ""}
        </div>
        <div class="portfolio-project-info">
          <div><h3>${esc(project.title)}</h3><p>${esc(project.description || "")}</p></div>
          <div class="project-meta">
            <span>${esc(project.category || "")}</span>
            <span>${esc([project.client, project.year].filter(Boolean).join(" · "))}</span>
            <span>${esc((project.tools || []).join(" · "))}</span>
            ${link ? `<a href="${link}" target="_blank" rel="noopener">View project ↗</a>` : ""}
            ${sources.length ? `<span class="source-list">Source: ${sources.map(x => esc(x.platform)).join(" · ")}</span>` : ""}
          </div>
        </div>
      </article>`;
    }).join("");
  }

  const links = [];
  if (p.showContactEmail !== false && p.contactEmail) {
    const email = String(p.contactEmail).trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      links.push(`<a href="mailto:${esc(email)}">Email ↗</a>`);
    }
  }
  if (p.phone) {
    const cleanPhone = p.phone.replace(/[^0-9+]/g, "");
    links.push(`<a href="https://wa.me/${cleanPhone.replace("+","")}" target="_blank" rel="noopener">WhatsApp ↗</a>`);
  }
  Object.entries(p.social || {}).forEach(([key, value]) => {
    const url = safeUrl(value);
    if (url) links.push(`<a href="${url}" target="_blank" rel="noopener">${socialLabel(key)} ↗</a>`);
  });
  document.getElementById("pContactLinks").innerHTML = links.join("") || "<span>Contact details available on request.</span>";

  document.getElementById("portfolioLoading").classList.add("hidden");
  document.getElementById("portfolio").classList.remove("hidden");
}

loadPortfolio();
