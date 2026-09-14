/**
 * build-changelog.js — Calendar by TCViz
 *
 * Renders CHANGELOG.md into changelog.html, styled like support.html, so the release
 * history is visible on GitHub Pages instead of living only as a Markdown file in the
 * repo. The version in the header is read from pbiviz.json, which is the single source
 * of truth — nothing here is typed by hand, so the page cannot drift from the release.
 *
 * No dependencies. Handles the Markdown subset actually used in CHANGELOG.md:
 * headings, horizontal rules, nested bullet lists, bold, inline code and links.
 *
 * Usage: node tools/build-changelog.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "CHANGELOG.md");
const OUT = path.join(ROOT, "changelog.html");
const PBIVIZ = path.join(ROOT, "pbiviz.json");

const REPO = "https://github.com/tinocallarisa-web/calendar";
const PAGES = "https://tinocallarisa-web.github.io/calendar";
const VIDEO = "https://www.youtube.com/watch?v=FUELmlkAGNI";
const MARKETPLACE = "https://marketplace.microsoft.com/en-us/product/power-bi-visuals/tino_callarisa.calendar-events-heatmap";
const SITE = "https://tcviz.com/product/calendar-events-heatmap/";

const version = JSON.parse(fs.readFileSync(PBIVIZ, "utf8")).visual.version;

// ── Markdown → HTML ─────────────────────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline formatting. Escapes first, so no Markdown can inject markup. */
function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_, c) => `<strong>${c}</strong>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) =>
      /^https?:\/\//.test(u) ? `<a href="${u}">${t}</a>` : t);
}

function render(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let listDepth = 0;          // 0 = not in a list
  let paragraph = [];

  const closeLists = () => { while (listDepth > 0) { out.push("</ul>"); listDepth--; } };
  const flushParagraph = () => {
    if (paragraph.length) { out.push(`<p>${inline(paragraph.join(" "))}</p>`); paragraph = []; }
  };
  const flushAll = () => { flushParagraph(); closeLists(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (line.trim() === "") { flushParagraph(); continue; }

    if (/^---+$/.test(line.trim())) { flushAll(); out.push("<hr>"); continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      // "# Changelog" is the page title, already in the header — skip it.
      if (heading[1].length === 1) continue;
      const level = Math.min(heading[1].length, 4);
      const text = inline(heading[2]);
      const id = heading[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      continue;
    }

    const bullet = /^(\s*)-\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      const depth = Math.floor(bullet[1].length / 2) + 1;
      while (listDepth < depth) { out.push("<ul>"); listDepth++; }
      while (listDepth > depth) { out.push("</ul>"); listDepth--; }
      out.push(`<li>${inline(bullet[2])}</li>`);
      continue;
    }

    // A continuation line inside a bullet belongs to that bullet.
    if (listDepth > 0 && /^\s+\S/.test(line)) {
      const last = out.length - 1;
      if (out[last].startsWith("<li>")) {
        out[last] = out[last].replace(/<\/li>$/, "") + " " + inline(line.trim()) + "</li>";
        continue;
      }
    }

    closeLists();
    paragraph.push(line.trim());
  }
  flushAll();
  return out.join("\n  ");
}

const body = render(fs.readFileSync(SRC, "utf8"));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Changelog — Calendar Events Heatmap by TCViz</title>
<meta name="description" content="Release history for the Calendar Events Heatmap Power BI custom visual by TCViz.">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#FAF9F5;color:#3D3929;line-height:1.6}
  header{background:#3D3929;color:#fff;padding:20px 40px;display:flex;align-items:center;gap:16px}
  header h1{font-size:20px;font-weight:700}
  header span{font-size:12px;color:#DAD9D4;margin-left:auto}
  nav{background:#EDE9DE;padding:10px 40px;display:flex;gap:24px;font-size:13px;flex-wrap:wrap}
  nav a{color:#535146;text-decoration:none;font-weight:600}
  nav a:hover{color:#C96442}
  main{max-width:860px;margin:40px auto;padding:0 24px 60px}
  h2{font-size:18px;font-weight:700;color:#3D3929;margin:36px 0 12px;border-bottom:2px solid #EDE9DE;padding-bottom:6px}
  h3{font-size:14px;font-weight:700;color:#535146;margin:20px 0 8px}
  h4{font-size:13px;font-weight:700;color:#83827D;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.04em}
  p{font-size:14px;color:#535146;margin-bottom:12px}
  ul{margin:0 0 12px 20px}
  li{font-size:14px;color:#535146;margin-bottom:5px}
  li ul{margin-top:5px}
  hr{border:0;border-top:1px solid #DAD9D4;margin:28px 0}
  code{background:#EDE9DE;padding:2px 6px;border-radius:3px;font-size:12px;font-family:ui-monospace,Consolas,monospace}
  strong{color:#3D3929}
  footer{text-align:center;font-size:12px;color:#83827D;padding:24px;border-top:1px solid #DAD9D4;margin-top:40px}
  footer a{color:#C96442;text-decoration:none}
</style>
</head>
<body>
<header>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 828 362" width="80" height="35" aria-label="TCViz">
    <defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#B05730"/><stop offset=".55" stop-color="#C96442"/><stop offset="1" stop-color="#9C87F5"/></linearGradient></defs>
    <g transform="translate(40,46)"><rect x="22" y="20" width="150" height="150" rx="30" fill="none" stroke="url(#g)" stroke-width="11"/><g fill="url(#g)"><rect x="42" y="110" width="20" height="58" rx="5"/><rect x="70" y="86" width="20" height="82" rx="5"/><rect x="98" y="62" width="20" height="106" rx="5"/><rect x="126" y="38" width="20" height="130" rx="5"/></g></g>
    <text x="258" y="246" font-family="'Segoe UI',sans-serif" font-weight="700" font-size="196" letter-spacing="-4"><tspan fill="url(#g)">tc</tspan><tspan fill="#fff">viz</tspan></text>
  </svg>
  <h1>Calendar Events Heatmap — Changelog</h1>
  <span>v${version} &middot; TCViz</span>
</header>
<nav>
  <a href="${PAGES}/support.html">Support &amp; Docs</a>
  <a href="${REPO}">GitHub</a>
  <a href="${REPO}/issues">Report an Issue</a>
  <a href="${REPO}/discussions">Questions &amp; Ideas</a>
  <a href="${VIDEO}">Video Tutorial</a>
  <a href="${MARKETPLACE}">Get the Visual</a>
</nav>

<main>
  ${body}
</main>

<footer>
  <a href="${SITE}">Product page</a> &middot;
  <a href="${MARKETPLACE}">Marketplace</a> &middot;
  <a href="${PAGES}/support.html">Support</a> &middot;
  <a href="${PAGES}/privacy.html">Privacy</a> &middot;
  <a href="${PAGES}/terms.html">Terms</a> &middot;
  <a href="${REPO}">GitHub</a> &middot;
  <a href="${REPO}/issues">Issues</a><br><br>
  &copy; 2026 TCViz &middot; Calendar Events Heatmap v${version}
</footer>
</body>
</html>
`;

fs.writeFileSync(OUT, html, "utf8");
console.log(`changelog.html written for v${version} (${html.length} bytes)`);
