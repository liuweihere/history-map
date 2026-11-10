// Phase 1 community adapter — behavior tests (TDD).
// Tests the pure transform functions in lib/jiangshan-transform.mjs
// against small fixture data mimicking the upstream GeoJSON export.
//
// Run: node --test site/test/import-jiangshan.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  pastelize,
  hexToRgb,
  transformSnapshot,
  transformIndex,
  transformCorridors,
  transformMilestones,
  assertNoPrefecture,
  assertNoYearZero,
  assertPhaseBoundaries,
  assertIndexFilesExist,
  deterministicStringify,
  sortKeys,
  sha256,
  buildManifest,
  PASTEL_FALLBACK,
} from "../scripts/lib/jiangshan-transform.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "jiangshan", "upstream-export");

async function loadJson(rel) {
  return JSON.parse(await readFile(path.join(FIXTURE, rel), "utf8"));
}

// ── Pastel color transform ────────────────────────────────────────

test("pastelize: deterministic — same input always same output", () => {
  const a = pastelize("#4a6fa5");
  const b = pastelize("#4a6fa5");
  assert.equal(a, b);
});

test("pastelize: produces light, desaturated pastel", () => {
  const result = pastelize("#4a6fa5"); // dark blue
  // Pastel should be lighter than original.
  const orig = hexToRgb("#4a6fa5");
  const pastel = hexToRgb(result);
  const origLum = (orig[0] + orig[1] + orig[2]) / 3;
  const pastelLum = (pastel[0] + pastel[1] + pastel[2]) / 3;
  assert.ok(pastelLum > origLum, `pastel ${result} should be lighter than #4a6fa5`);
});

test("pastelize: missing/invalid tint → safe fallback", () => {
  assert.equal(pastelize(undefined), PASTEL_FALLBACK);
  assert.equal(pastelize(null), PASTEL_FALLBACK);
  assert.equal(pastelize("not-a-color"), PASTEL_FALLBACK);
  assert.equal(pastelize("#xyz"), PASTEL_FALLBACK);
});

test("pastelize: accepts #rrggbb and #rgb forms", () => {
  assert.ok(pastelize("#4a6fa5").startsWith("#"));
  assert.ok(pastelize("#abc").startsWith("#"));
  assert.equal(pastelize("#abc"), pastelize("#aabbcc")); // expanded form
});

// ── Snapshot transform ────────────────────────────────────────────

test("transformSnapshot: filters to polity layer, drops region", async () => {
  const snap = await loadJson("snapshots/s_qin_chuhan.geojson");
  const out = transformSnapshot(snap);
  const layers = out.features.map((f) => f.properties.layer);
  assert.ok(layers.every((l) => l === "polity"), "only polity features");
  assert.equal(out.features.length, 2, "2 polities (汉, 西楚), region dropped");
  // Region feature (并州) should not appear.
  assert.ok(!out.features.some((f) => f.properties.title === "并州"));
});

test("transformSnapshot: adds display_color, keeps original tint", async () => {
  const snap = await loadJson("snapshots/s_qin_chuhan.geojson");
  const out = transformSnapshot(snap);
  const han = out.features.find((f) => f.properties.title === "汉");
  assert.equal(han.properties.tint, "#c98a2b", "original tint preserved");
  assert.ok(han.properties.display_color, "display_color added");
  assert.equal(han.properties.display_color, pastelize("#c98a2b"));
});

test("transformSnapshot: missing tint → fallback display_color", async () => {
  const snap = await loadJson("snapshots/s_qin_a.geojson");
  const out = transformSnapshot(snap);
  const nanyue = out.features.find((f) => f.properties.title === "南越");
  // 南越 has no tint in fixture.
  assert.equal(nanyue.properties.tint, undefined);
  assert.equal(nanyue.properties.display_color, PASTEL_FALLBACK);
});

test("transformSnapshot: missing anchor does not crash", () => {
  const snap = {
    type: "FeatureCollection",
    name: "test",
    features: [
      {
        type: "Feature",
        properties: { layer: "polity", title: "X", tint: "#ff0000" },
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      },
    ],
  };
  const out = transformSnapshot(snap);
  assert.equal(out.features.length, 1);
  assert.equal(out.features[0].properties.anchor, undefined);
});

test("transformSnapshot: handles MultiPolygon", async () => {
  const snap = await loadJson("snapshots/s_qin_a.geojson");
  const out = transformSnapshot(snap);
  const qin = out.features.find((f) => f.properties.title === "秦");
  assert.equal(qin.geometry.type, "MultiPolygon", "MultiPolygon geometry preserved");
});

test("transformSnapshot: handles Polygon with hole (interior ring)", () => {
  const snap = {
    type: "FeatureCollection",
    name: "test",
    features: [
      {
        type: "Feature",
        properties: { layer: "polity", title: "X", tint: "#ff0000" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], // exterior
            [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]], // hole
          ],
        },
      },
    ],
  };
  const out = transformSnapshot(snap);
  assert.equal(out.features[0].geometry.coordinates.length, 2, "hole preserved");
});

test("transformSnapshot: full geometry not cropped/truncated", async () => {
  const snap = await loadJson("snapshots/s_xihan_a.geojson");
  const out = transformSnapshot(snap);
  const han = out.features.find((f) => f.properties.title === "汉");
  // Original has exterior + interior ring (hole); both must survive.
  assert.equal(han.geometry.coordinates.length, 2);
  // Verify coordinates match original exactly.
  const origHan = snap.features.find((f) => f.properties.title === "汉");
  assert.deepEqual(han.geometry.coordinates, origHan.geometry.coordinates);
});

// ── Index transform ───────────────────────────────────────────────

test("transformIndex: keeps dynasties + phases with snapshot/from/to/file/overview", async () => {
  const idx = await loadJson("index.json");
  const snapshotKeys = ["s_qin_chuhan", "s_qin_a", "s_xihan_a", "s_donghan", "s_sanguo"];
  const out = transformIndex(idx, snapshotKeys);
  assert.ok(Array.isArray(out.dynasties));
  assert.ok(out.dynasties.length > 0);
  const qin = out.dynasties.find((d) => d.key === "qin");
  assert.ok(qin.phases.every((ph) => "snapshot" in ph && "from" in ph && "to" in ph && "file" in ph));
});

test("transformIndex: layers only reference produced files (no settlements/neighbors/rivers)", async () => {
  const idx = await loadJson("index.json");
  const out = transformIndex(idx, ["s_qin_chuhan", "s_qin_a", "s_xihan_a", "s_donghan", "s_sanguo"]);
  const layerKeys = Object.keys(out.layers);
  assert.deepEqual(layerKeys.sort(), ["corridors", "milestones"]);
});

test("transformIndex: throws if phase references missing snapshot", async () => {
  const idx = await loadJson("index.json");
  // Provide incomplete key set (missing s_qin_a).
  assert.throws(
    () => transformIndex(idx, ["s_qin_chuhan", "s_xihan_a", "s_donghan", "s_sanguo"]),
    /missing snapshot/i,
  );
});

// ── Prefecture absence assertion ──────────────────────────────────

test("assertNoPrefecture: passes when no prefecture features", async () => {
  const snap = await loadJson("snapshots/s_qin_chuhan.geojson");
  const transformed = transformSnapshot(snap);
  // Should not throw.
  assertNoPrefecture({ "s_qin_chuhan": transformed });
});

test("assertNoPrefecture: throws when prefecture features present", () => {
  const fc = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { layer: "prefecture", title: "X" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
    ],
  };
  assert.throws(() => assertNoPrefecture({ "bad": fc }), /prefecture/i);
});

// ── Year boundary validation ──────────────────────────────────────

test("assertNoYearZero: passes for valid index", async () => {
  const idx = await loadJson("index.json");
  const out = transformIndex(idx, ["s_qin_chuhan", "s_qin_a", "s_xihan_a", "s_donghan", "s_sanguo"]);
  assertNoYearZero(out);
});

test("assertNoYearZero: throws when year 0 present", () => {
  const idx = {
    dynasties: [{ key: "test", from: 0, to: 5, phases: [{ snapshot: "s", from: 0, to: 5, file: "snapshots/s.geojson" }] }],
  };
  assert.throws(() => assertNoYearZero(idx), /year 0/i);
});

test("assertPhaseBoundaries: -202 belongs to 西汉 (later dynasty)", async () => {
  const idx = await loadJson("index.json");
  const out = transformIndex(idx, ["s_qin_chuhan", "s_qin_a", "s_xihan_a", "s_donghan", "s_sanguo"]);
  // 秦.to should be -203, 西汉.from should be -202 (boundary belongs to later).
  const qin = out.dynasties.find((d) => d.key === "qin");
  const xihan = out.dynasties.find((d) => d.key === "xihan");
  assert.equal(qin.to, -203);
  assert.equal(xihan.from, -202);
  assertPhaseBoundaries(out);
});

test("assertPhaseBoundaries: 219/220 boundary — 东汉 ends at 219, 三国 starts at 220", async () => {
  const idx = await loadJson("index.json");
  const out = transformIndex(idx, ["s_qin_chuhan", "s_qin_a", "s_xihan_a", "s_donghan", "s_sanguo"]);
  const donghan = out.dynasties.find((d) => d.key === "donghan");
  const sanguo = out.dynasties.find((d) => d.key === "sanguo");
  assert.equal(donghan.to, 219);
  assert.equal(sanguo.from, 220);
  assertPhaseBoundaries(out);
});

test("assertPhaseBoundaries: -1→1 no year 0 gap in BCE/CE transition", () => {
  // Construct an index that spans BCE/CE.
  const idx = {
    dynasties: [
      { key: "pre", from: -10, to: -1, phases: [{ snapshot: "s_pre", from: -10, to: -1, file: "snapshots/s_pre.geojson" }] },
      { key: "post", from: 1, to: 50, phases: [{ snapshot: "s_post", from: 1, to: 50, file: "snapshots/s_post.geojson" }] },
    ],
  };
  // pre.to=-1, post.from=1 → gap at 0, which is correct (no year 0).
  // But assertPhaseBoundaries checks d.to+1 === next.from → -1+1=0 ≠ 1.
  // This is expected behavior: there IS a gap at year 0 (which doesn't exist).
  // The assertion should NOT throw for this specific BCE/CE case.
  // We handle this by checking: if d.to === -1 and next.from === 1, that's valid.
  assertPhaseBoundaries(idx);
});

// ── Index file existence validation ───────────────────────────────

test("assertIndexFilesExist: passes when all files present", async () => {
  const idx = await loadJson("index.json");
  const out = transformIndex(idx, ["s_qin_chuhan", "s_qin_a", "s_xihan_a", "s_donghan", "s_sanguo"]);
  const files = [
    "snapshots/s_qin_chuhan.geojson",
    "snapshots/s_qin_a.geojson",
    "snapshots/s_xihan_a.geojson",
    "snapshots/s_donghan.geojson",
    "snapshots/s_sanguo.geojson",
  ];
  assertIndexFilesExist(out, files);
});

test("assertIndexFilesExist: throws when file missing", async () => {
  const idx = await loadJson("index.json");
  const out = transformIndex(idx, ["s_qin_chuhan", "s_qin_a", "s_xihan_a", "s_donghan", "s_sanguo"]);
  const files = ["snapshots/s_qin_chuhan.geojson"]; // incomplete
  assert.throws(() => assertIndexFilesExist(out, files), /missing/i);
});

// ── Corridors transform ───────────────────────────────────────────

test("transformCorridors: deterministic sort by key", async () => {
  const cor = await loadJson("corridors.geojson");
  const out1 = transformCorridors(cor);
  const out2 = transformCorridors(cor);
  assert.deepEqual(out1.features, out2.features);
  // Sorted by key.
  const keys = out1.features.map((f) => f.properties.key);
  assert.deepEqual([...keys].sort(), keys);
});

// ── Milestones transform ──────────────────────────────────────────

test("transformMilestones: adds source_key for traceability", async () => {
  const ms = await loadJson("milestones.geojson");
  const out = transformMilestones(ms);
  for (const f of out.features) {
    assert.ok(f.properties.source_key, "source_key present");
    assert.ok(f.properties.source_key.startsWith(f.properties.dynasty + ":"));
  }
});

test("transformMilestones: source_key is deterministic per dynasty+year+index", async () => {
  const ms = await loadJson("milestones.geojson");
  const out1 = transformMilestones(ms);
  const out2 = transformMilestones(ms);
  assert.deepEqual(
    out1.features.map((f) => f.properties.source_key),
    out2.features.map((f) => f.properties.source_key),
  );
});

// ── Deterministic serialization ───────────────────────────────────

test("deterministicStringify: same object → same bytes", () => {
  const obj = { b: 2, a: 1, c: [3, 1, 2] };
  const s1 = deterministicStringify(obj);
  const s2 = deterministicStringify({ c: [3, 1, 2], a: 1, b: 2 });
  assert.equal(s1, s2, "key order in input doesn't affect output");
});

test("deterministicStringify: sorted keys", () => {
  const s = deterministicStringify({ z: 1, a: 2, m: 3 });
  assert.ok(s.indexOf('"a"') < s.indexOf('"m"'));
  assert.ok(s.indexOf('"m"') < s.indexOf('"z"'));
});

test("deterministic output: full transform pipeline is reproducible", async () => {
  const idx = await loadJson("index.json");
  const snapshotKeys = ["s_qin_chuhan", "s_qin_a", "s_xihan_a", "s_donghan", "s_sanguo"];

  async function runPipeline() {
    const snaps = {};
    for (const key of snapshotKeys) {
      snaps[key] = transformSnapshot(await loadJson(`snapshots/${key}.geojson`));
    }
    const cor = transformCorridors(await loadJson("corridors.geojson"));
    const ms = transformMilestones(await loadJson("milestones.geojson"));
    const outIdx = transformIndex(idx, snapshotKeys);
    return { snaps, cor, ms, outIdx };
  }

  const r1 = await runPipeline();
  const r2 = await runPipeline();

  // Every output file should serialize identically.
  for (const key of snapshotKeys) {
    assert.equal(
      deterministicStringify(r1.snaps[key]),
      deterministicStringify(r2.snaps[key]),
      `snapshot ${key} deterministic`,
    );
  }
  assert.equal(deterministicStringify(r1.cor), deterministicStringify(r2.cor));
  assert.equal(deterministicStringify(r1.ms), deterministicStringify(r2.ms));
  assert.equal(deterministicStringify(r1.outIdx), deterministicStringify(r2.outIdx));
});

// ── Manifest ──────────────────────────────────────────────────────

test("buildManifest: three hash groups (bundles, script, output)", () => {
  const manifest = buildManifest({
    adapterVersion: "0.1.0",
    schemaVersion: "1",
    config: { pastelize: true, crop: false },
    inputBundles: { "atlas_snapshots.js": "abc123" },
    exportScriptHash: "def456",
    outputFiles: [{ path: "index.json", sha256: "ghi789" }],
  });
  assert.ok(manifest.upstream_input_bundles, "has input bundle hashes");
  assert.ok(manifest.export_script_sha256, "has export script hash");
  assert.ok(manifest.output_files, "has output file hashes");
});

test("buildManifest: deterministic (no dates in manifest)", () => {
  const args = {
    adapterVersion: "0.1.0",
    schemaVersion: "1",
    config: {},
    inputBundles: {},
    exportScriptHash: "x",
    outputFiles: [],
  };
  const m1 = buildManifest(args);
  const m2 = buildManifest(args);
  assert.equal(deterministicStringify(m1), deterministicStringify(m2));
});

// ── sha256 helper ─────────────────────────────────────────────────

test("sha256: correct hash for known input", () => {
  const hash = sha256(Buffer.from("hello"));
  assert.equal(hash.length, 64);
  assert.equal(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});
