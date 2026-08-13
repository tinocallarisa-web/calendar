/**
 * build-test.js — Calendar by TCViz
 *
 * Patches visual.ts and pbiviz.json for a test build (isPro=true, guid_test),
 * runs pbiviz package, then restores both files.
 *
 * Usage: node build-test.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const VISUAL_TS = path.join(__dirname, "src", "visual.ts");
const PBIVIZ_JSON = path.join(__dirname, "pbiviz.json");

const ISPRO_MARKER = "private isPro: boolean = false; // ISPRO_MARKER";
const ISPRO_PATCHED = "private isPro: boolean = true; // ISPRO_MARKER";

// ── Read originals ───────────────────────────────────────────────────────────
const originalVisual = fs.readFileSync(VISUAL_TS, "utf8");
const originalPbiviz = fs.readFileSync(PBIVIZ_JSON, "utf8");
const pbivizObj = JSON.parse(originalPbiviz);
const originalGuid = pbivizObj.visual.guid;

// ── Validate marker exists ───────────────────────────────────────────────────
if (!originalVisual.includes(ISPRO_MARKER)) {
  console.error("❌ ISPRO_MARKER not found in visual.ts. Aborting.");
  process.exit(1);
}

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  fs.writeFileSync(VISUAL_TS, originalVisual, "utf8");
  fs.writeFileSync(PBIVIZ_JSON, originalPbiviz, "utf8");
  console.log("✅ Files restored.");
}

process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(1); });
process.on("uncaughtException", (e) => { console.error(e); restore(); process.exit(1); });

try {
  // ── Patch ─────────────────────────────────────────────────────────────────
  const patchedVisual = originalVisual.replace(ISPRO_MARKER, ISPRO_PATCHED);
  fs.writeFileSync(VISUAL_TS, patchedVisual, "utf8");

  pbivizObj.visual.guid = originalGuid + "_test";
  fs.writeFileSync(PBIVIZ_JSON, JSON.stringify(pbivizObj, null, 2), "utf8");

  console.log(`🔧 Patched: guid → ${pbivizObj.visual.guid}`);
  console.log("📦 Running pbiviz package...");

  // ── Build ─────────────────────────────────────────────────────────────────
  execSync("npx pbiviz package", { stdio: "inherit", cwd: __dirname });

  console.log("✅ Test build complete. Check dist/ for the .pbiviz file.");
} finally {
  restore();
}
