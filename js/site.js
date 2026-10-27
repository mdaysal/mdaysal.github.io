// Renders the site from contents/index.xml and contents/research.xml.
// Each page sets <body data-page="..."> and the matching render function runs on load.

const NAV = [
  { href: "index.html", label: "Home", page: "home" },
  { href: "publications.html", label: "Publications", page: "publications" },
  { href: "wp.html", label: "Working Papers", page: "wp" },
  { href: "commentary.html", label: "Commentary", page: "commentary" },
  { href: "media.html", label: "Media", page: "media" },
  { href: "docs/CV.pdf", label: "CV", page: "cv" }
];

const EMAIL = "meltem.daysal@econ.ku.dk";
const SCHOLAR = "https://scholar.google.com/citations?user=mBR_4egAAAAJ&hl=en";
const PRESS_PREVIEW = 5; // outlets listed under each paper before "+N more"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const SEASONS = { winter: 1, spring: 4, summer: 7, fall: 10, autumn: 10 };

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function loadXML(path) {
  // "no-cache" makes the browser check for a newer copy, so content edits show up on the next visit.
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(path + ": " + res.status);
  return new DOMParser().parseFromString(await res.text(), "application/xml");
}

// Trimmed text of the first <tag> child, or "" if missing.
function field(node, tag) {
  const el = node.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : "";
}

// Sort key for paper dates such as "July 2026", "Summer 2024", "Revised February 2014", "2016".
function paperDateKey(s) {
  const words = s.toLowerCase().replace("revised", "").trim().split(/\s+/);
  const year = parseInt(words.find(w => /^\d{4}$/.test(w)) || "0", 10);
  let month = 0;
  for (const w of words) {
    const m = MONTHS.findIndex(name => name.toLowerCase() === w);
    if (m >= 0) month = m + 1;
    if (SEASONS[w]) month = SEASONS[w];
  }
  return year * 100 + month;
}

// Media dates are ISO-like: "2026-08-10", "2026-08" or "2026".
function mediaDateKey(s) {
  if (!s) return 0;
  const [y, m = "0", d = "0"] = s.split("-");
  return (+y) * 10000 + (+m) * 100 + (+d);
}

function formatMediaDate(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  if (!m) return y;
  const mon = MONTHS[+m - 1].slice(0, 3);
  return d ? `${+d} ${mon} ${y}` : `${mon} ${y}`;
}

function mediaItems(paper) {
  return Array.from(paper.getElementsByTagName("item")).map(el => ({
    outlet: el.getAttribute("outlet"),
    date: el.getAttribute("date") || "",
    url: el.getAttribute("url") || "",
    type: el.getAttribute("type") || "",
    lang: el.getAttribute("lang") || "",
    featured: el.getAttribute("featured") === "yes",
    title: el.textContent.trim(),
    paper: el.getAttribute("paper") || "",
    with: el.getAttribute("with") || "",
    pdf: el.getAttribute("pdf") || "",
    also: el.getAttribute("also") || "",
    alsoUrl: el.getAttribute("also_url") || ""
  }));
}

// Columns, op-eds and policy briefs, newest first.
function commentaryItems(xml) {
  const block = xml.querySelector("research_info > commentary");
  return block ? mediaItems(block).sort((a, b) => mediaDateKey(b.date) - mediaDateKey(a.date)) : [];
}

// Policy citations show on the paper itself but are not press coverage.
const isCitation = m => m.type.startsWith("Cited in");

function sortedPapers(xml, tag) {
  return Array.from(xml.getElementsByTagName(tag))
    .sort((a, b) => paperDateKey(field(b, "date")) - paperDateKey(field(a, "date")));
}

// Sets an element's HTML if the page has it (a cached older page may lack newer boxes).
function fill(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
  return el;
}

function linkOrText(url, text) {
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text);
}

/* ---------- Page chrome ---------- */

function renderChrome(page) {
  const nav = NAV.map(n => {
    const current = n.page === page ? ' aria-current="page"' : "";
    const target = n.page === "cv" ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${n.href}"${current}${target}>${n.label}</a>`;
  }).join("");
  fill("site-header", `<div class="wrap"><a class="site-name" href="index.html">N. Meltem Daysal</a>` +
    `<nav class="site-nav" aria-label="Main">${nav}</nav></div>`);
  fill("site-footer", `<div class="wrap"><span>© ${new Date().getFullYear()} N. Meltem Daysal · University of Copenhagen</span>` +
    `<span><a href="mailto:${EMAIL}">Email</a> · <a href="${SCHOLAR}" target="_blank" rel="noopener">Google Scholar</a>` +
    ` · <a href="https://twitter.com/meltemdaysal" target="_blank" rel="noopener">X / Twitter</a></span></div>`);
}

/* ---------- Paper lists ---------- */

function paperHTML(p, kind, commentary) {
  const id = field(p, "id");
  const coauthors = field(p, "coauthors");
  const date = field(p, "date");
  const abstract = field(p, "abstract");
  const doc = field(p, "doc");
  const doi = field(p, "doi");
  const video = field(p, "video");
  const notes = field(p, "notes");
  const media = mediaItems(p);

  let meta = coauthors ? `with ${esc(coauthors)}. ` : "";
  let status = "";
  let series = notes;
  if (kind === "wp") {
    meta += esc(date) + ".";
    // Working-paper notes hold the series numbers, then "<br>" and the review status.
    const [seriesPart, statusPart] = notes.split(/<br\s*\/?>/i);
    series = seriesPart.trim() ? "Working paper versions: " + seriesPart.trim() : "";
    status = (statusPart || "").trim().replace(/<b>(.*?)<\/b>/gi, '<span class="venue">$1</span>');
  } else {
    const vol = field(p, "vol_issue").replace(/:$/, "");
    const pages = field(p, "pages");
    meta += `<span class="venue">${esc(field(p, "journal"))}</span>` +
      (vol ? ` ${esc(vol)}` : "") + (date ? ` (${esc(date)})` : "") + (pages ? `, ${esc(pages)}` : "") + ".";
  }

  const actions = [];
  if (abstract) {
    actions.push(`<button class="btn" type="button" aria-expanded="false" aria-controls="abs-${id}">Abstract</button>`);
  }
  if (doc) {
    const label = kind === "wp" ? "Paper (PDF)" : "Pre-publication version";
    actions.push(`<a class="btn" href="docs/${encodeURI(doc)}" target="_blank" rel="noopener">${label}</a>`);
  }
  if (doi) actions.push(`<a class="btn" href="${esc(doi)}" target="_blank" rel="noopener">Journal article</a>`);
  if (video) actions.push(`<a class="btn" href="${esc(video)}" target="_blank" rel="noopener">Video summary</a>`);

  let press = "";
  if (media.length) {
    const shown = media.slice(0, PRESS_PREVIEW)
      .map(m => m.url ? linkOrText(m.url, m.outlet) : `${esc(m.outlet)} (print)`).join(", ");
    const more = media.length > PRESS_PREVIEW
      ? `, <a href="media.html#${id}">+${media.length - PRESS_PREVIEW} more</a>`
      : "";
    const policyOnly = media.every(m => m.type.startsWith("Cited in"));
    if (policyOnly) {
      const cites = media.map(m => `${linkOrText(m.url, "“" + m.title + "”")} (${esc(m.outlet)})`).join("; ");
      press = `<p class="press"><span class="label">Cited in:</span>${cites}</p>`;
    } else {
      press = `<p class="press"><span class="label">In the media:</span>${shown}${more}</p>`;
    }
  }
  const comm = commentary.filter(c => c.paper === id);
  if (comm.length) {
    const links = comm.map(c => linkOrText(c.url || (c.pdf && "docs/" + c.pdf), c.outlet)).join(", ");
    press += `<p class="press"><span class="label">Commentary:</span>${links}</p>`;
  }

  return `<article class="paper" id="${id}">
    <h3 class="paper-title">${esc(field(p, "title"))}</h3>
    <p class="paper-meta">${meta}</p>
    ${status ? `<p class="paper-status">${status}</p>` : ""}
    ${series ? `<p class="paper-notes">${series}</p>` : ""}
    ${press}
    <div class="paper-actions">${actions.join("")}</div>
    ${abstract ? `<div class="panel" id="abs-${id}" hidden><p>${abstract}</p></div>` : ""}
  </article>`;
}

function wireAbstracts(root) {
  root.querySelectorAll("button[aria-controls]").forEach(btn => {
    btn.addEventListener("click", () => {
      const panel = document.getElementById(btn.getAttribute("aria-controls"));
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      panel.hidden = open;
    });
  });
}

function renderList(xml, tag, kind, containerId) {
  const commentary = commentaryItems(xml);
  const el = fill(containerId, sortedPapers(xml, tag).map(p => paperHTML(p, kind, commentary)).join(""));
  if (el) wireAbstracts(el);
}

/* ---------- Media ---------- */

function featureCard(m, paperTitle) {
  const when = formatMediaDate(m.date);
  return `<a class="feature" href="${esc(m.url)}" target="_blank" rel="noopener">
    <span class="outlet">${esc(m.outlet)}</span>
    <span class="headline">${esc(m.title)}</span>
    <span class="paper-ref">${when ? esc(when) + " · " : ""}On: ${esc(paperTitle)}</span>
  </a>`;
}

function featuredMedia(xml, limit) {
  const all = [];
  for (const p of xml.querySelectorAll("pub, wp, opub")) {
    const title = field(p, "title").split(":")[0];
    for (const m of mediaItems(p)) if (m.featured && m.url) all.push({ m, title });
  }
  all.sort((a, b) => mediaDateKey(b.m.date) - mediaDateKey(a.m.date));
  return all.slice(0, limit).map(x => featureCard(x.m, x.title)).join("");
}

// Chronological list of all coverage, newest first.
// media.html#<paper id> narrows the list to one paper (used by "+N more" links).
function renderMedia(xml) {
  fill("featured", featuredMedia(xml, 6));

  const all = [];
  for (const p of xml.querySelectorAll("pub, wp, opub")) {
    const paper = {
      id: field(p, "id"),
      title: field(p, "title"),
      page: p.tagName === "wp" ? "wp.html" : "publications.html"
    };
    for (const m of mediaItems(p)) if (!isCitation(m)) all.push({ m, paper });
  }
  const general = xml.querySelector("research_info > media");
  if (general) for (const m of mediaItems(general)) all.push({ m, paper: null });
  all.sort((a, b) => mediaDateKey(b.m.date) - mediaDateKey(a.m.date));

  const filterId = location.hash.slice(1);
  const filtered = all.filter(x => x.paper && x.paper.id === filterId);
  const rows = filtered.length ? filtered : all;

  const note = filtered.length
    ? `<p class="filter-note">Showing coverage of <a href="${filtered[0].paper.page}#${filterId}">${esc(filtered[0].paper.title)}</a>` +
      ` · <a href="media.html">Show all coverage</a></p>`
    : "";

  const lis = rows.map(({ m, paper }) => {
    const when = formatMediaDate(m.date);
    const on = paper
      ? `<span class="on-paper">On: <a href="${paper.page}#${paper.id}">${esc(paper.title.split(":")[0])}</a></span>`
      : "";
    return `<li><span class="outlet">${esc(m.outlet)}${when ? `<span class="when">${esc(when)}</span>` : ""}</span>
      <span class="headline">${linkOrText(m.url, m.title)}${on}</span></li>`;
  }).join("");
  fill("coverage", note + `<ul class="media-list">${lis}</ul>`);

  if (filtered.length) document.getElementById("coverage")?.scrollIntoView();
}

/* ---------- Commentary ---------- */

function renderCommentary(xml) {
  const papers = {};
  for (const p of xml.querySelectorAll("pub, wp")) {
    papers[field(p, "id")] = { title: field(p, "title").split(":")[0], page: p.tagName === "wp" ? "wp.html" : "publications.html" };
  }
  fill("commentary", commentaryItems(xml).map(c => {
    const when = formatMediaDate(c.date);
    const meta = [esc(c.outlet), c.type && esc(c.type), when && esc(when)].filter(Boolean).join(" · ");
    const lines = [];
    if (c.with) lines.push(`with ${esc(c.with)}`);
    if (c.also) lines.push(`Republished in ${linkOrText(c.alsoUrl, c.also)}`);
    const paper = papers[c.paper];
    if (paper) lines.push(`Based on: <a href="${paper.page}#${c.paper}">${esc(paper.title)}</a>`);
    // The title links to the online version, or to the PDF in docs/ when there is none.
    return `<article class="paper">
      <h3 class="paper-title">${linkOrText(c.url || (c.pdf && "docs/" + c.pdf), c.title)}</h3>
      <p class="paper-meta">${meta}</p>
      ${lines.length ? `<p class="paper-notes">${lines.join("<br>")}</p>` : ""}
    </article>`;
  }).join(""));
}

/* ---------- Home ---------- */

function renderHome(info, research) {
  const about = info.getElementsByTagName("about_me")[0].textContent.replace(/(<br\s*\/?>\s*)+$/i, "");
  fill("about", about);
  const email = field(info, "email");
  fill("contact", `<p><a href="mailto:${esc(email)}">${esc(email)}</a></p>` +
    `<p>Department of Economics<br>${info.getElementsByTagName("address")[0].textContent.trim()}</p>` +
    `<p>${esc(field(info, "phone"))}</p>`);
  fill("recent-papers", recentPapers(research, 3));
  fill("featured-in", featuredIn(research));
}

// The newest papers across publications and working papers, with their status line.
function recentPapers(xml, limit) {
  const papers = Array.from(xml.querySelectorAll("pub, wp"))
    .sort((a, b) => paperDateKey(field(b, "date")) - paperDateKey(field(a, "date")))
    .slice(0, limit);
  return papers.map(p => {
    const id = field(p, "id");
    const isWp = p.tagName === "wp";
    const page = isWp ? "wp.html" : "publications.html";
    // Working-paper notes hold the series numbers, then "<br>" and the review status.
    const status = isWp
      ? (field(p, "notes").split(/<br\s*\/?>/i)[1] || `Working paper, ${esc(field(p, "date"))}`).trim()
          .replace(/<b>(.*?)<\/b>/gi, '<span class="venue">$1</span>')
      : `Published in <span class="venue">${esc(field(p, "journal"))}</span>, ${esc(field(p, "date"))}`;
    const doc = field(p, "doc");
    return `<article class="recent">
      <h3 class="paper-title"><a href="${page}#${id}">${esc(field(p, "title"))}</a></h3>
      <p class="paper-meta">with ${esc(field(p, "coauthors"))}</p>
      <p class="paper-status">${status}</p>
      ${doc ? `<p class="press"><a href="docs/${encodeURI(doc)}" target="_blank" rel="noopener">PDF</a></p>` : ""}
    </article>`;
  }).join("");
}

// One line naming the outlets of the featured stories, linking to the Media page.
function featuredIn(xml) {
  const items = Array.from(xml.querySelectorAll("pub item, wp item"))
    .filter(el => el.getAttribute("featured") === "yes")
    .sort((a, b) => mediaDateKey(b.getAttribute("date")) - mediaDateKey(a.getAttribute("date")));
  const outlets = [...new Set(items.map(el => el.getAttribute("outlet").split(",")[0].trim()))];
  return `<span class="label">Featured in</span> ${outlets.map(esc).join(" · ")} · <a href="media.html">All media coverage →</a>`;
}

/* ---------- Boot ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  renderChrome(page);
  try {
    const research = await loadXML("contents/research.xml");
    if (page === "home") renderHome(await loadXML("contents/index.xml"), research);
    if (page === "publications") {
      renderList(research, "pub", "pub", "pubs");
      renderList(research, "opub", "pub", "comments");
    }
    if (page === "wp") renderList(research, "wp", "wp", "wps");
    if (page === "commentary") renderCommentary(research);
    if (page === "media") {
      renderMedia(research);
      window.addEventListener("hashchange", () => renderMedia(research));
    }
    if (location.hash && page !== "media") document.getElementById(location.hash.slice(1))?.scrollIntoView();
  } catch (err) {
    document.querySelector("main .wrap").insertAdjacentHTML("beforeend",
      `<p class="error">Content could not be loaded (${esc(err.message)}).</p>`);
  }
});
