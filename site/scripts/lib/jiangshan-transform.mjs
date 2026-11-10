// jiangshan-transform.mjs — pure transform/validation functions for the
// Phase 1 community adapter (PLAN.md V3 §4–§6).
//
// No filesystem I/O here: every function takes data and returns data.
// The CLI wrapper (import-jiangshan.mjs) handles reading/writing files.
//
// Contract (PLAN §4):
//   - Deterministic output: same input → same bytes (sorted keys, no randomness).
//   - Polity only (drop region, prefecture); full geometry, no cropping.
//   - Deterministic pastel color transform; keep original tint field.
//   - Index references only files we actually produce.
//   - No year 0 (-1 → 1); phase boundaries per upstream index rules.
//   - CHGIS prefecture absence assertion.

import { createHash } from "node:crypto";

// ── Deterministic pastel color transform ──────────────────────────
// PLAN §4.3: "导入时确定性粉彩化（HSL 提亮去饱和至马卡龙域）"
// HSL: raise lightness to 0.78–0.88 band, lower saturation to 0.28–0.38.
// Input is a hex color string (#rgb or #rrggbb). Missing/invalid → fallback.
export const PASTEL_FALLBACK = "#D8D8D8";

export function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim();
  if (!h.startsWith("#")) return null;
  h = h.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

export function hslToRgb([h, s, l]) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

export function rgbToHex([r, g, b]) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Deterministic pastel: fix hue, clamp saturation to 0.30, lightness to 0.82.
// Same input always yields same output — no randomness.
export function pastelize(tint) {
  const rgb = hexToRgb(tint);
  if (!rgb) return PASTEL_FALLBACK;
  const hsl = rgbToHsl(rgb);
  hsl[1] = 0.30; // fixed saturation
  hsl[2] = 0.82; // fixed lightness
  return rgbToHex(hslToRgb(hsl));
}

// ── Snapshot transform: filter to polity, add display_color ───────
export function transformSnapshot(fc) {
  if (!fc || fc.type !== "FeatureCollection") {
    throw new Error("Invalid snapshot: not a FeatureCollection");
  }
  const features = (fc.features || [])
    .filter((f) => f && f.properties && f.properties.layer === "polity")
    .map((f) => {
      const props = { ...f.properties };
      // Keep original tint; add deterministic pastel display_color.
      props.tint = props.tint || undefined;
      props.display_color = pastelize(props.tint);
      // Ensure anchor present but allow missing (safe — don't crash).
      if (props.anchor === undefined) delete props.anchor;
      return { ...f, properties: cleanObject(props) };
    });
  return {
    type: "FeatureCollection",
    name: fc.name,
    license: fc.license,
    bbox: fc.bbox,
    from: fc.from,
    to: fc.to,
    caption: fc.caption || undefined,
    note: fc.note || undefined,
    features,
  };
}

// ── Index transform: only reference produced layers ───────────────
// Drop layers we don't produce (settlements, neighbors, rivers, lakes,
// hydro_labels). Keep dynasties + phases structure, but verify every
// phase.file points to a snapshot we actually produce.
export function transformIndex(upstreamIndex, producedSnapshotKeys) {
  const keySet = new Set(producedSnapshotKeys);
  const dynasties = (upstreamIndex.dynasties || []).map((d) => ({
    key: d.key,
    title: d.title,
    title_en: d.title_en,
    from: d.from,
    to: d.to,
    tint: d.tint,
    phases: (d.phases || []).map((ph) => {
      const out = {
        snapshot: ph.snapshot,
        from: ph.from,
        to: ph.to,
        file: ph.file,
      };
      if (ph.overview) out.overview = ph.overview;
      return out;
    }),
  }));

  // Validate: every phase.file references a produced snapshot.
  const missing = [];
  for (const d of dynasties) {
    for (const ph of d.phases) {
      const snapKey = ph.snapshot;
      if (!keySet.has(snapKey)) {
        missing.push(`${d.key}/${snapKey} → ${ph.file}`);
      }
    }
  }
  if (missing.length) {
    throw new Error(
      `Index references missing snapshot files (${missing.length}): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " ..." : ""}`,
    );
  }

  return {
    name: "jiangshan-map adapted data package",
    license: upstreamIndex.license,
    crs: upstreamIndex.crs,
    years: upstreamIndex.years,
    coverage: upstreamIndex.coverage,
    prefecture_layer: "not exported (CHGIS terms); adapter asserts zero prefecture features",
    layers: {
      corridors: "corridors.geojson",
      milestones: "milestones.geojson",
    },
    dynasties,
  };
}

// ── Corridors: pass-through with deterministic key sort ───────────
export function transformCorridors(fc) {
  if (!fc || fc.type !== "FeatureCollection") return fc;
  const features = [...(fc.features || [])].sort((a, b) => {
    const ka = (a.properties && a.properties.key) || "";
    const kb = (b.properties && b.properties.key) || "";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return { ...fc, features };
}

// ── Milestones: add deterministic source_key for traceability ─────
// PLAN §4: "适配器应建立可追溯的版本内来源键"
// source_key = `${dynasty}:${year}:${indexInDynastyGroup}`
export function transformMilestones(fc) {
  if (!fc || fc.type !== "FeatureCollection") return fc;
  // Group by dynasty to compute per-dynasty index.
  const counters = {};
  const features = (fc.features || []).map((f) => {
    const props = f.properties || {};
    const dyn = props.dynasty || "unknown";
    counters[dyn] = (counters[dyn] || 0) + 1;
    return {
      ...f,
      properties: cleanObject({
        ...props,
        source_key: `${dyn}:${props.year}:${counters[dyn]}`,
      }),
    };
  });
  return { ...fc, features };
}

// ── Validation: CHGIS prefecture absence assertion ────────────────
// PLAN §5: "禁用图层未出现" — prefecture layer must have zero features.
export function assertNoPrefecture(collections) {
  const found = [];
  for (const [name, fc] of Object.entries(collections)) {
    if (!fc || !fc.features) continue;
    const prefs = fc.features.filter(
      (f) => f && f.properties && f.properties.layer === "prefecture",
    );
    if (prefs.length) found.push(`${name}: ${prefs.length} prefecture feature(s)`);
  }
  if (found.length) {
    throw new Error(
      `CHGIS prefecture layer assertion FAILED — prefecture features found:\n${found.join("\n")}`,
    );
  }
}

// ── Validation: no year 0 ─────────────────────────────────────────
// PLAN §3/§5: "-1↔1 不出现0" — there is no year 0 in the year system.
export function assertNoYearZero(index) {
  const zeros = [];
  for (const d of index.dynasties || []) {
    if (d.from === 0 || d.to === 0) zeros.push(`${d.key} from/to`);
    for (const ph of d.phases || []) {
      if (ph.from === 0 || ph.to === 0) zeros.push(`${d.key}/${ph.snapshot} from/to`);
    }
  }
  if (zeros.length) {
    throw new Error(`Year 0 found (forbidden): ${zeros.join(", ")}`);
  }
}

// ── Validation: phase boundary consistency ────────────────────────
// Boundary year belongs to the later dynasty (upstream rule).
// Special case: -1 → 1 is contiguous because year 0 does not exist.
export function assertPhaseBoundaries(index) {
  const errors = [];
  for (let i = 0; i < index.dynasties.length; i++) {
    const d = index.dynasties[i];
    // Intra-dynasty: phases within same dynasty must be contiguous.
    for (let j = 0; j < d.phases.length - 1; j++) {
      const cur = d.phases[j];
      const nxt = d.phases[j + 1];
      // BCE/CE boundary within dynasty: -1 → 1 is valid (no year 0).
      if (cur.to === -1 && nxt.from === 1) continue;
      if (cur.to + 1 !== nxt.from) {
        errors.push(`${d.key} phase gap: ${cur.snapshot}.to=${cur.to} but ${nxt.snapshot}.from=${nxt.from} (expected ${cur.to + 1})`);
      }
    }
    // Inter-dynasty: dynasty.to + 1 === next dynasty.from.
    const next = index.dynasties[i + 1];
    if (!next) continue;
    if (d.to === -1 && next.from === 1) continue;
    if (d.to + 1 !== next.from) {
      errors.push(`${d.key}.to=${d.to} but ${next.key}.from=${next.from} (expected ${d.to + 1})`);
    }
  }
  if (errors.length) {
    throw new Error(`Phase boundary inconsistency: ${errors.join("; ")}`);
  }
}

// ── Validation: all referenced snapshot files exist ───────────────
export function assertIndexFilesExist(index, existingFiles) {
  const fileSet = new Set(existingFiles);
  const missing = [];
  for (const d of index.dynasties || []) {
    for (const ph of d.phases || []) {
      if (!fileSet.has(ph.file)) {
        missing.push(`${d.key}/${ph.snapshot} → ${ph.file}`);
      }
    }
  }
  if (missing.length) {
    throw new Error(
      `Index references ${missing.length} missing file(s): ${missing.slice(0, 5).join(", ")}`,
    );
  }
}

// ── Validation: required output files are present ─────────────────
// index.json, corridors.geojson, milestones.geojson are strictly required.
export const REQUIRED_FILES = ["index.json", "corridors.geojson", "milestones.geojson"];

export function assertRequiredFiles(outputFileNames) {
  const set = new Set(outputFileNames);
  const missing = REQUIRED_FILES.filter((f) => !set.has(f));
  if (missing.length) {
    throw new Error(
      `Required output file(s) missing: ${missing.join(", ")}`,
    );
  }
}

// ── Deterministic serialization ───────────────────────────────────
// Sort object keys alphabetically, stable JSON formatting.
export function deterministicStringify(obj) {
  return JSON.stringify(sortKeys(obj), null, 0) + "\n";
}

export function sortKeys(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = sortKeys(obj[k]);
  return sorted;
}

// ── SHA-256 helper ────────────────────────────────────────────────
export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// ── Manifest builder ──────────────────────────────────────────────
// PLAN §4: manifest records schema, source version, config, file list + SHA-256.
// Three hash groups (per coordinator):
//   1. upstream_input_bundles: SHA-256 of js/*.js source bundles
//   2. export_script: SHA-256 of export_geojson.js
//   3. output_files: SHA-256 of each produced file
export function buildManifest({ adapterVersion, schemaVersion, config, inputBundles, exportScriptHash, outputFiles }) {
  return {
    adapter_version: adapterVersion,
    schema_version: schemaVersion,
    config,
    upstream_input_bundles: inputBundles, // { filename: sha256 }
    export_script_sha256: exportScriptHash,
    output_files: outputFiles, // [{ path, sha256 }]
  };
}

// ── Sync report (non-deterministic: includes export date) ─────────
// PLAN §4: "导出日期放入独立同步报告，不影响确定性输出"
export function buildSyncReport({ manifest, exportDate, upstreamPath, stats }) {
  return {
    export_date: exportDate,
    upstream_path: upstreamPath,
    adapter_version: manifest.adapter_version,
    schema_version: manifest.schema_version,
    stats,
  };
}

// ── Helpers ───────────────────────────────────────────────────────
function cleanObject(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") o[k] = v;
  }
  return o;
}
