#!/usr/bin/env node
// import-jiangshan.mjs — Phase 1 community adapter CLI (PLAN.md V3 §4–§6).
// Reads upstream jiangshan-map GeoJSON export, transforms to site data package.
// Upstream export script NEVER run from upstream dir — copies to temp first.
// Default output: site/.jiangshan-staging/ (NOT in public/).

import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile, rename, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  transformSnapshot, transformIndex, transformCorridors, transformMilestones,
  assertNoPrefecture, assertNoYearZero, assertPhaseBoundaries, assertIndexFilesExist,
  deterministicStringify, sha256, buildManifest, buildSyncReport,
} from "./lib/jiangshan-transform.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SITE_ROOT = path.resolve(__dirname, "..");
const ADAPTER_VERSION = "0.1.0";
const SCHEMA_VERSION = "1";
const CONFIG = { pastelize: true, crop: false, layers: ["polity", "corridors", "milestones"] };
const BUNDLE_FILES = ["map_data.js", "china_geo_data.js", "atlas_snapshots.js", "i18n_dict.js"];

function parseArgs(argv) {
  const args = { publish: false, fixture: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--upstream=")) args.upstream = a.slice("--upstream=".length);
    else if (a === "--upstream") args.upstream = argv[++i];
    else if (a.startsWith("--output=")) args.output = a.slice("--output=".length);
    else if (a === "--output") args.output = argv[++i];
    else if (a === "--publish") args.publish = true;
    else if (a === "--fixture") args.fixture = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node scripts/import-jiangshan.mjs --upstream <path> [--output <path>] [--publish] [--fixture]");
      process.exit(0);
    }
  }
  if (!args.fixture && !args.upstream) {
    console.error("Error: --upstream <path> required (or use --fixture).");
    process.exit(1);
  }
  if (!args.output) args.output = path.join(SITE_ROOT, ".jiangshan-staging");
  return args;
}

async function fileSha256(p) { return sha256(await readFile(p)); }

async function readExportTree(dir, base) {
  base = base || "";
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? base + "/" + e.name : e.name;
    if (e.isDirectory()) files.push(...(await readExportTree(path.join(dir, e.name), rel)));
    else if (e.name.endsWith(".json") || e.name.endsWith(".geojson")) files.push(rel);
  }
  return files;
}

async function runUpstreamExport(upstreamDir) {
  const exportScript = path.join(upstreamDir, "scripts", "export_geojson.js");
  const jsDir = path.join(upstreamDir, "js");
  await access(exportScript);
  await access(jsDir);
  const workDir = await mkdtemp(path.join(os.tmpdir(), "jiangshan-export-"));
  const exportOutDir = path.join(workDir, "export-out");
  // export_geojson.js uses ROOT = path.resolve(__dirname, '..'), expecting
  // to live in a scripts/ subdir with js/ as sibling. Replicate that layout.
  const scriptsDir = path.join(workDir, "scripts");
  const workJsDir = path.join(workDir, "js");
  try {
    await mkdir(scriptsDir, { recursive: true });
    await mkdir(workJsDir, { recursive: true });
    await cp(exportScript, path.join(scriptsDir, "export_geojson.js"));
    for (const f of BUNDLE_FILES) {
      try { await access(path.join(jsDir, f)); await cp(path.join(jsDir, f), path.join(workJsDir, f)); }
      catch { console.warn("Warning: bundle " + f + " not found."); }
    }
    execFileSync("node", [path.join(scriptsDir, "export_geojson.js"), exportOutDir], { cwd: workDir, stdio: "pipe", encoding: "utf8", timeout: 60000 });
    const inputBundles = {};
    for (const f of BUNDLE_FILES) {
      const p = path.join(workJsDir, f);
      if (existsSync(p)) inputBundles[f] = await fileSha256(p);
    }
    const exportScriptHash = await fileSha256(path.join(scriptsDir, "export_geojson.js"));
    const exported = {};
    for (const rel of await readExportTree(exportOutDir)) {
      exported[rel] = JSON.parse(await readFile(path.join(exportOutDir, rel), "utf8"));
    }
    return { exported, inputBundles, exportScriptHash, upstreamPath: upstreamDir };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function transformPipeline(exported, inputBundles, exportScriptHash, upstreamPath) {
  const upstreamIndex = exported["index.json"];
  if (!upstreamIndex) throw new Error("Upstream export missing index.json");
  const snapshotRels = Object.keys(exported).filter((k) => k.startsWith("snapshots/") && k.endsWith(".geojson"));
  const snapshotKeys = snapshotRels.map((r) => r.replace("snapshots/", "").replace(".geojson", ""));
  const transformedSnaps = {};
  for (const rel of snapshotRels) {
    const key = rel.replace("snapshots/", "").replace(".geojson", "");
    transformedSnaps[key] = transformSnapshot(exported[rel]);
  }
  const corridors = exported["corridors.geojson"] ? transformCorridors(exported["corridors.geojson"]) : null;
  const milestones = exported["milestones.geojson"] ? transformMilestones(exported["milestones.geojson"]) : null;
  const outIndex = transformIndex(upstreamIndex, snapshotKeys);
  assertNoPrefecture(transformedSnaps);
  assertNoYearZero(outIndex);
  assertPhaseBoundaries(outIndex);
  assertIndexFilesExist(outIndex, snapshotRels);
  const outputFiles = {};
  for (const [key, fc] of Object.entries(transformedSnaps)) {
    outputFiles["snapshots/" + key + ".geojson"] = deterministicStringify(fc);
  }
  if (corridors) outputFiles["corridors.geojson"] = deterministicStringify(corridors);
  if (milestones) outputFiles["milestones.geojson"] = deterministicStringify(milestones);
  outputFiles["index.json"] = deterministicStringify(outIndex);
  const outputHashes = [];
  for (const [rel, content] of Object.entries(outputFiles).sort()) {
    outputHashes.push({ path: rel, sha256: sha256(Buffer.from(content)) });
  }
  const manifest = buildManifest({
    adapterVersion: ADAPTER_VERSION, schemaVersion: SCHEMA_VERSION, config: CONFIG,
    inputBundles, exportScriptHash, outputFiles: outputHashes,
  });
  outputFiles["manifest.json"] = deterministicStringify(manifest);
  const syncReport = buildSyncReport({
    manifest, exportDate: new Date().toISOString(), upstreamPath,
    stats: {
      snapshots: snapshotKeys.length,
      polity_features: Object.values(transformedSnaps).reduce((n, fc) => n + fc.features.length, 0),
      corridors: corridors ? corridors.features.length : 0,
      milestones: milestones ? milestones.features.length : 0,
    },
  });
  outputFiles["sync-report.json"] = deterministicStringify(syncReport);
  outputFiles["LICENSE"] = await readLicenseText(upstreamPath);
  outputFiles["NOTICE"] = buildNoticeText();
  return { outputFiles, manifest, syncReport };
}

async function readLicenseText(upstreamPath) {
  if (!upstreamPath) return "GPL-3.0 — see https://www.gnu.org/licenses/gpl-3.0.txt\n";
  try { return await readFile(path.join(upstreamPath, "LICENSE"), "utf8"); }
  catch { return "GPL-3.0 — see https://www.gnu.org/licenses/gpl-3.0.txt\n"; }
}

function buildNoticeText() {
  return [
    "This data package is derived from:", "",
    "1. jiangshan-map (Chronicles of the Realm)",
    "   https://github.com/DeanChensj/jiangshan-map  License: GPL-3.0",
    "   Historical borders are schematic approximations.", "",
    "2. historical-basemaps by aourednik",
    "   https://github.com/aourednik/historical-basemaps", "",
    "3. CartoDB Positron (site frontend only)", "   https://basemaps.cartocdn.com", "",
    "Prefecture layer (CHGIS V6 / Hartwell) NOT included — adapter asserts zero.",
    "Rights release for public/commercial deployment: PENDING HUMAN REVIEW.", "",
  ].join("\n") + "\n";
}

async function writeToStaging(outputFiles) {
  const stageDir = await mkdtemp(path.join(os.tmpdir(), "jiangshan-stage-"));
  try {
    for (const [rel, content] of Object.entries(outputFiles)) {
      const target = path.join(stageDir, rel);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    for (const rel of Object.keys(outputFiles)) {
      const p = path.join(stageDir, rel);
      await access(p);
      if (rel.endsWith(".json") || rel.endsWith(".geojson")) JSON.parse(await readFile(p, "utf8"));
    }
    return stageDir;
  } catch (err) {
    await rm(stageDir, { recursive: true, force: true });
    throw err;
  }
}

async function safeSwapDir(src, dst) {
  // rename is atomic on same filesystem; fall back to recursive copy.
  try {
    await rename(src, dst);
  } catch {
    await cp(src, dst, { recursive: true });
    await rm(src, { recursive: true, force: true });
  }
}

async function atomicPublish(stageDir, outputDir) {
  // Verify parent exists.
  const parent = path.dirname(outputDir);
  if (!existsSync(parent)) {
    await rm(stageDir, { recursive: true, force: true });
    throw new Error("Atomic publish failed: parent directory does not exist: " + parent);
  }
  // If output exists, verify it is a previous adapter output (has manifest.json).
  // Refuse to overwrite directories containing non-adapter data.
  if (existsSync(outputDir)) {
    const manifestPath = path.join(outputDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      await rm(stageDir, { recursive: true, force: true });
      throw new Error(
        "Atomic publish refused: " + outputDir + " exists but has no manifest.json. " +
        "Refusing to overwrite a directory that may contain non-adapter data. " +
        "Remove it manually if you are sure, or use a different --output path."
      );
    }
  }
  const backupDir = path.join(parent, path.basename(outputDir) + ".bak." + Date.now());
  if (existsSync(outputDir)) await safeSwapDir(outputDir, backupDir);
  try {
    await safeSwapDir(stageDir, outputDir);
    if (existsSync(backupDir)) await rm(backupDir, { recursive: true, force: true });
  } catch (err) {
    if (existsSync(backupDir)) await safeSwapDir(backupDir, outputDir);
    throw new Error("Atomic publish failed, existing restored: " + err.message);
  }
}

async function loadFixtureExport() {
  const fixtureDir = path.join(__dirname, "..", "test", "fixtures", "jiangshan", "upstream-export");
  const exported = {};
  const files = await readExportTree(fixtureDir);
  for (const rel of files) exported[rel] = JSON.parse(await readFile(path.join(fixtureDir, rel), "utf8"));
  const inputBundles = {};
  for (const f of files) inputBundles[f] = await fileSha256(path.join(fixtureDir, f));
  return { exported, inputBundles, exportScriptHash: "fixture-mode", upstreamPath: null };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log("[import-jiangshan] adapter v" + ADAPTER_VERSION + ", schema v" + SCHEMA_VERSION);
  console.log("[import-jiangshan] output: " + args.output);
  let exportResult;
  if (args.fixture) {
    console.log("[import-jiangshan] mode: fixture");
    exportResult = await loadFixtureExport();
  } else {
    console.log("[import-jiangshan] mode: upstream from " + args.upstream);
    exportResult = await runUpstreamExport(args.upstream);
  }
  const { exported, inputBundles, exportScriptHash, upstreamPath } = exportResult;
  console.log("[import-jiangshan] loaded: " + Object.keys(exported).length + " files");
  const { outputFiles, manifest, syncReport } = await transformPipeline(exported, inputBundles, exportScriptHash, upstreamPath);
  console.log("[import-jiangshan] transform: " + Object.keys(outputFiles).length + " files");
  console.log("[import-jiangshan] stats:", syncReport.stats);
  const stageDir = await writeToStaging(outputFiles);
  if (args.publish) {
    await atomicPublish(stageDir, args.output);
    console.log("[import-jiangshan] published: " + args.output);
  } else {
    // SAFETY: never rm -rf an existing directory. If output exists, refuse
    // and tell user to use --publish (which backs up first) or remove manually.
    if (existsSync(args.output)) {
      await rm(stageDir, { recursive: true, force: true });
      throw new Error(
        "Output directory already exists: " + args.output +
        "\nRefusing to overwrite. Use --publish to atomically swap (backs up old first), " +
        "or remove the directory manually if you are sure."
      );
    }
    await mkdir(path.dirname(args.output), { recursive: true });
    // rename may fail across filesystems; fall back to recursive copy + cleanup.
    try {
      await rename(stageDir, args.output);
    } catch {
      await cp(stageDir, args.output, { recursive: true });
      await rm(stageDir, { recursive: true, force: true });
    }
    console.log("[import-jiangshan] output: " + args.output);
    console.log("[import-jiangshan] staging mode — NOT in public/. For T0: --publish --output site/public/data/jiangshan");
  }
  console.log("\n=== Manifest ===");
  console.log("adapter: " + manifest.adapter_version + " | schema: " + manifest.schema_version);
  console.log("export_script: " + manifest.export_script_sha256.slice(0, 16) + "...");
  console.log("input_bundles: " + Object.keys(manifest.upstream_input_bundles).join(", "));
  console.log("output_files: " + manifest.output_files.length);
  for (const f of manifest.output_files) console.log("  " + f.path + ": " + f.sha256.slice(0, 16) + "...");
}

main().catch((err) => {
  console.error("[import-jiangshan] FAILED: " + err.message);
  console.error(err.stack);
  process.exit(1);
});
