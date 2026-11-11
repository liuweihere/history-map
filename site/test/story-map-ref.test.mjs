// Phase 2 · 故事地图参考（map_ref）审定绑定纯函数测试（TDD）。
//
// 用户批准口径：
// - proposed 不加载/不展示为正式地图，继续手绘回退，可显示待审候选信息。
// - approved 必须有非空人工理由 + 可校验的 index 与快照版本/哈希；
//   缺失/失配/快照缺失/加载失败均显式回退，绝不按年份自动猜。
// - 候选不含 AI 审定的理由，不写桥接表内容。
// - 版本身份元数据匹配 ≠ 加载字节完整性；后者须实际计算响应字节哈希。
//
// 测试中 approved 理由一律用通用 fixture 文本"测试用理由"，非正式历史审定。
//
// 运行：node --import tsx --test test/story-map-ref.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

// namespace 导入：未导出的名称不致 import 期 SyntaxError，RED 体现为断言失败。
import * as jiangshanData from "../lib/jiangshan-data.js";

const {
  resolveStorySnapshotRef,
  snapshotUrlForRef,
  verifySnapshotBytes,
  mapRefBadgeText,
  decideMapRefLoad,
  mapRefStatusOnApprovedFailure,
  isByteVerificationAvailable,
} = jiangshanData;

// ── 最小 index fixture（含 s_qin_chuhan / s_xihan_a 两个真实 phase）──
const INDEX = {
  dynasties: [
    {
      key: "qin",
      title: "秦",
      from: -221,
      to: -203,
      phases: [
        {
          snapshot: "s_qin_chuhan",
          from: -206,
          to: -203,
          file: "snapshots/s_qin_chuhan.geojson",
          overview: "楚汉相争",
        },
      ],
    },
    {
      key: "xihan",
      title: "西汉",
      from: -202,
      to: 24,
      phases: [
        {
          snapshot: "s_xihan_a",
          from: -202,
          to: -128,
          file: "snapshots/s_xihan_a.geojson",
          overview: "西汉",
        },
      ],
    },
  ],
};

// ── 真实 sha256（与部署 manifest 一致）──────────────────────────────
const REAL_INDEX_SHA =
  "795a2d105d418ad249c93271a8e9c338dad69eae2250e87e4fa0b0ae422c8c63";
const REAL_CHUHAN_SHA =
  "66e072c2bc0313eab33e6195b8d0ebfaf36e3420254e3ad79e9bd4330009dcd3";
const REAL_XIHAN_SHA =
  "2692dd61b061188ede16441dff983b833c4dad726c172f6f0d316ad685c6ff73";

const MANIFEST = {
  adapter_version: "0.1.0",
  output_files: [
    { path: "index.json", sha256: REAL_INDEX_SHA },
    { path: "snapshots/s_qin_chuhan.geojson", sha256: REAL_CHUHAN_SHA },
    { path: "snapshots/s_xihan_a.geojson", sha256: REAL_XIHAN_SHA },
  ],
};

function makeStory(mapRef) {
  return {
    story_id: "story_000_xiang_yu_wujiang",
    timeline: { year: -202 },
    map_plan: {
      id: "map_plan_202_bce_xiang_yu_wujiang",
      display_type: "retreat_corridor",
      certainty: "medium",
      ...(mapRef ? { map_ref: mapRef } : {}),
    },
  };
}

// ── 0. 被测函数存在（RED 锚点：导入成功，断言函数存在）──────────────
test("resolveStorySnapshotRef / snapshotUrlForRef / verifySnapshotBytes / mapRefBadgeText are exported", () => {
  assert.equal(typeof resolveStorySnapshotRef, "function");
  assert.equal(typeof snapshotUrlForRef, "function");
  assert.equal(typeof verifySnapshotBytes, "function");
  assert.equal(typeof mapRefBadgeText, "function");
  assert.equal(typeof decideMapRefLoad, "function");
  assert.equal(typeof mapRefStatusOnApprovedFailure, "function");
  assert.equal(typeof isByteVerificationAvailable, "function");
});

// ── 1. approved + 版本符 + 非空理由 → 激活审定快照 ───────────────────
test("approved with matching version and non-empty rationale activates", () => {
  const story = makeStory({
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
    status: "approved",
    data_version: {
      index_sha256: REAL_INDEX_SHA,
      snapshot_sha256: REAL_CHUHAN_SHA,
      adapter_version: "0.1.0",
    },
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "approved");
  assert.equal(ref.snapshot_id, "s_qin_chuhan");
  assert.equal(ref.phase.snapshot, "s_qin_chuhan");
  assert.equal(ref.phase.from, -206);
  assert.equal(ref.phase.to, -203);
  assert.equal(ref.version_ok, true);
  assert.ok(ref.rationale.length > 0);
});

// ── 2. proposed → 不作已审定激活，仅候选；正式地图走手绘回退 ────────
test("proposed does not activate as approved — candidate only", () => {
  const story = makeStory({
    snapshot_id: "s_qin_chuhan",
    rationale: "",
    status: "proposed",
    data_version: {
      index_sha256: REAL_INDEX_SHA,
      snapshot_sha256: REAL_CHUHAN_SHA,
    },
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "proposed");
  assert.equal(ref.snapshot_id, "s_qin_chuhan");
  assert.equal(ref.phase.snapshot, "s_qin_chuhan");
});

// ── 3. 无 map_ref → none（管宁等纯底座故事手绘回退，不受影响）───────
test("missing map_ref → none (hand-drawn fallback, pure-base stories)", () => {
  const story = makeStory(null);
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "none");
  assert.equal(ref.reason, "no_map_ref");
});

// ── 19. UI 徽章文案：approved/proposed/none/fallback（§2 显示要求）──
test("mapRefBadgeText: approved shows snapshot id + rationale", () => {
  const badge = mapRefBadgeText({
    kind: "approved",
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
  });
  assert.ok(badge.text.includes("s_qin_chuhan"));
  assert.ok(badge.text.includes("测试用理由"));
  assert.ok(badge.className.includes("approved"));
});

test("mapRefBadgeText: proposed shows candidate + 待人工审定", () => {
  const badge = mapRefBadgeText({
    kind: "proposed",
    snapshot_id: "s_qin_chuhan",
    rationale: "",
  });
  assert.ok(badge.text.includes("待审候选"));
  assert.ok(badge.text.includes("s_qin_chuhan"));
  assert.ok(badge.text.includes("手绘"));
  assert.ok(badge.className.includes("proposed"));
});

test("mapRefBadgeText: none version_mismatch shows fallback text", () => {
  const badge = mapRefBadgeText({ kind: "none", reason: "version_mismatch" });
  assert.ok(badge.text.includes("版本不符"));
  assert.ok(badge.text.includes("回退手绘"));
  assert.ok(badge.className.includes("fallback"));
});

test("mapRefBadgeText: none no_map_ref returns null (no badge for pure-base)", () => {
  const badge = mapRefBadgeText({ kind: "none", reason: "no_map_ref" });
  assert.equal(badge, null);
});

// ─── 独立验收第 1 轮 FAIL 修复：组件行为与退化诚实性 ───────────────

// 24. approved 加载/字节失败 → 状态必须降级为 none，不得谎称 approved
test("approved load failure must degrade to none, never report approved", () => {
  const approvedRef = {
    kind: "approved",
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
    phase: { snapshot: "s_qin_chuhan", file: "snapshots/s_qin_chuhan.geojson" },
    version_ok: true,
  };
  const status = mapRefStatusOnApprovedFailure(approvedRef, "snapshot_load_failed");
  assert.equal(status.kind, "none");
  assert.equal(status.reason, "snapshot_load_failed");
  assert.notEqual(status.kind, "approved");
  const badge = mapRefBadgeText(status);
  assert.ok(badge.text.includes("回退手绘"));
  assert.ok(!badge.text.includes("审定参考"));
});

// 25. 字节校验不可用（非安全 LAN 无 WebCrypto）→ approved 不得加载，降级提示
test("byte verification unavailable (non-secure LAN) → approved not loaded, degraded", () => {
  const approvedRef = {
    kind: "approved",
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
    phase: { snapshot: "s_qin_chuhan", file: "snapshots/s_qin_chuhan.geojson" },
    version_ok: true,
  };
  const plan = decideMapRefLoad(approvedRef, { byteCheckAvailable: false });
  assert.equal(plan.shouldLoad, false);
  assert.equal(plan.statusOnSkip.kind, "none");
  assert.equal(plan.statusOnSkip.reason, "byte_check_unavailable");
  const badge = mapRefBadgeText(plan.statusOnSkip);
  assert.ok(badge && badge.text.includes("回退手绘"));
});

// 26. decideMapRefLoad：approved + 字节可用 → 应加载
test("decideMapRefLoad: approved with byte check available → should load", () => {
  const approvedRef = {
    kind: "approved",
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
    phase: { snapshot: "s_qin_chuhan", file: "snapshots/s_qin_chuhan.geojson" },
    version_ok: true,
  };
  const plan = decideMapRefLoad(approvedRef, { byteCheckAvailable: true });
  assert.equal(plan.shouldLoad, true);
  assert.equal(plan.statusOnSkip, null);
});

// 27. decideMapRefLoad：proposed/none → 不加载审定快照
test("decideMapRefLoad: proposed/none → no approved load", () => {
  const proposed = { kind: "proposed", snapshot_id: "s_qin_chuhan", rationale: "" };
  assert.equal(decideMapRefLoad(proposed, { byteCheckAvailable: true }).shouldLoad, false);
  const none = { kind: "none", reason: "no_map_ref" };
  assert.equal(decideMapRefLoad(none, { byteCheckAvailable: true }).shouldLoad, false);
});

// 28. 徽章对所有退化原因均显示失效提示（不得 null）
test("mapRefBadgeText shows fallback for all degradation reasons", () => {
  const reasons = [
    "version_mismatch",
    "snapshot_not_found",
    "approved_rationale_missing",
    "invalid_status",
    "data_load_failed",
    "snapshot_load_failed",
    "byte_check_unavailable",
  ];
  for (const reason of reasons) {
    const badge = mapRefBadgeText({ kind: "none", reason, snapshot_id: "s_qin_chuhan" });
    assert.ok(badge, `reason=${reason} must produce a badge, not null`);
    assert.ok(badge.text.includes("回退手绘") || badge.text.includes("缺失"), `reason=${reason} text=${badge?.text}`);
    assert.ok(badge.className.includes("fallback"));
  }
});

// 29. isByteVerificationAvailable：反映 crypto.subtle 存在性
test("isByteVerificationAvailable reflects crypto.subtle presence", () => {
  assert.equal(typeof isByteVerificationAvailable(), "boolean");
});

// 29b. index 响应字节校验：内容变更但 manifest 不变 → 拒绝（防 index 篡改）
test("verifyBytesAgainstManifest rejects tampered index bytes", async () => {
  const { verifyBytesAgainstManifest } = jiangshanData;
  const tamperedIndex = new TextEncoder().encode('{"dynasties":[]}');
  const ok = await verifyBytesAgainstManifest(tamperedIndex, MANIFEST, "index.json");
  assert.equal(ok, false, "tampered index must not pass byte verification");
});

// 29c. index 真实字节 → 通过
test("verifyBytesAgainstManifest passes for real index bytes", async () => {
  const { verifyBytesAgainstManifest } = jiangshanData;
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const realBytes = await readFile(
    fileURLToPath(new URL("../public/data/jiangshan/index.json", import.meta.url)),
  );
  const ok = await verifyBytesAgainstManifest(realBytes, MANIFEST, "index.json");
  assert.equal(ok, true);
});

// 30. approved polity labels are real markers with remove (not bare DOM nodes)
test("approved polity labels are real markers with remove (not bare DOM nodes)", async () => {
  // jsdom：createMarker 回调用 document.createElement 构造标签节点
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "http://localhost/",
  });
  Object.defineProperty(globalThis, "document", {
    value: dom.window.document,
    writable: true,
    configurable: true,
  });

  const { applyPolityToMap, clearPolityLayers } = await import("../lib/exploration-map-layers.js");
  const fakeMarkers = [];
  const fakeMap = {
    _layers: new Map(),
    _sources: new Map(),
    getLayer(id) { return this._layers.has(id) ? this._layers.get(id) : undefined; },
    getSource(id) { return this._sources.has(id) ? this._sources.get(id) : undefined; },
    addSource(id, spec) { this._sources.set(id, spec); },
    addLayer(spec, beforeId) { this._layers.set(spec.id, { spec, beforeId }); },
    removeLayer(id) { this._layers.delete(id); },
    removeSource(id) { this._sources.delete(id); },
    isStyleLoaded() { return true; },
  };
  const fakeMaplibre = {
    Marker: class {
      constructor(opts) { this.opts = opts; this.removed = false; }
      setLngLat(c) { this.lng = c; return this; }
      addTo(m) { fakeMarkers.push(this); return this; }
      remove() { this.removed = true; }
    },
  };
  const labelsRef = { current: [] };
  const snapshot = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { title: "汉", tint: "#4a6fa5", display_color: "#aabbcc", anchor: [110, 34] },
        geometry: { type: "Polygon", coordinates: [[[109,33],[111,33],[111,35],[109,35],[109,33]]] },
      },
    ],
  };
  const createMarker = (props, anchor) => {
    const ml = fakeMaplibre;
    if (!ml) return null;
    const node = document.createElement("div");
    node.textContent = props.title ?? "";
    return new ml.Marker({ element: node, anchor: "center" })
      .setLngLat(anchor)
      .addTo(fakeMap);
  };
  const versionRef = { current: null };
  const applied = applyPolityToMap(fakeMap, snapshot, "k1", {
    versionRef,
    labelsRef,
    createMarker,
  });
  assert.equal(applied, true);
  assert.equal(labelsRef.current.length, 1, "polity label marker created");
  assert.equal(typeof labelsRef.current[0].remove, "function", "marker has remove");
  clearPolityLayers(fakeMap, labelsRef);
  assert.equal(labelsRef.current.length, 0, "markers cleared");
  assert.equal(fakeMarkers[0].removed, true, "marker.remove() called");
});

// ── 4. approved 但理由为空 → none（必须有非空人工理由）──────────────
test("approved with empty rationale → none (rationale required)", () => {
  const story = makeStory({
    snapshot_id: "s_qin_chuhan",
    rationale: "",
    status: "approved",
    data_version: {
      index_sha256: REAL_INDEX_SHA,
      snapshot_sha256: REAL_CHUHAN_SHA,
    },
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "none");
  assert.equal(ref.reason, "approved_rationale_missing");
});

// ── 5. approved 版本不符（index sha256 不匹配）→ none，不静默复用 ──
test("approved with mismatched index sha256 → none version_mismatch", () => {
  const story = makeStory({
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
    status: "approved",
    data_version: {
      index_sha256: "deadbeef".repeat(8),
      snapshot_sha256: REAL_CHUHAN_SHA,
    },
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "none");
  assert.equal(ref.reason, "version_mismatch");
});

// ── 6. approved 版本不符（snapshot sha256 不匹配）→ none ───────────
test("approved with mismatched snapshot sha256 → none version_mismatch", () => {
  const story = makeStory({
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
    status: "approved",
    data_version: {
      index_sha256: REAL_INDEX_SHA,
      snapshot_sha256: "0".repeat(64),
    },
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "none");
  assert.equal(ref.reason, "version_mismatch");
});

// ── 7. approved 缺 data_version → none（无可校验版本）──────────────
test("approved missing data_version → none version_mismatch", () => {
  const story = makeStory({
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
    status: "approved",
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "none");
  assert.equal(ref.reason, "version_mismatch");
});

// ── 8. snapshot_id 不在 index → none（快照缺失，绝不按年份自动猜）──
test("snapshot_id not in index → none snapshot_not_found (no year guess)", () => {
  const story = makeStory({
    snapshot_id: "s_nonexistent",
    rationale: "测试用理由",
    status: "approved",
    data_version: {
      index_sha256: REAL_INDEX_SHA,
      snapshot_sha256: "x".repeat(64),
    },
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "none");
  assert.equal(ref.reason, "snapshot_not_found");
});

// ── 9. status 缺失/非法 → none ────────────────────────────────────
test("invalid status → none invalid_status", () => {
  const story = makeStory({
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
    status: "draft",
    data_version: {
      index_sha256: REAL_INDEX_SHA,
      snapshot_sha256: REAL_CHUHAN_SHA,
    },
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "none");
  assert.equal(ref.reason, "invalid_status");
});

// ── 10. 真实 -202 项羽候选：proposed 态（候选、非已审定）──────────
test("xiang yu -202 candidate is proposed (not approved)", () => {
  const story = makeStory({
    snapshot_id: "s_qin_chuhan",
    rationale: "",
    status: "proposed",
    data_version: {
      index_sha256: REAL_INDEX_SHA,
      snapshot_sha256: REAL_CHUHAN_SHA,
    },
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "proposed");
  assert.equal(ref.rationale, "");
});

// ── 11. 无 map_ref 时不按年份猜，不会返回 s_xihan_a ────────────────
test("no map_ref does not auto-resolve to s_xihan_a via year", () => {
  const storyNoRef = makeStory(null);
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, storyNoRef);
  assert.equal(ref.kind, "none");
  assert.notEqual(ref.snapshot_id, "s_xihan_a");
});

// ── 12. snapshotUrlForRef：approved 返回正确 URL；none 返回 null ───
test("snapshotUrlForRef returns URL for approved, null for none", () => {
  const approved = resolveStorySnapshotRef(
    INDEX,
    MANIFEST,
    makeStory({
      snapshot_id: "s_qin_chuhan",
      rationale: "测试用理由",
      status: "approved",
      data_version: {
        index_sha256: REAL_INDEX_SHA,
        snapshot_sha256: REAL_CHUHAN_SHA,
      },
    }),
  );
  assert.equal(snapshotUrlForRef(approved), "/data/jiangshan/snapshots/s_qin_chuhan.geojson");

  const none = resolveStorySnapshotRef(INDEX, MANIFEST, makeStory(null));
  assert.equal(snapshotUrlForRef(none), null);
});

// ── 13. proposed 快照缺失 → none（候选也不展示不存在的快照）──────
test("proposed with snapshot_id not in index → none snapshot_not_found", () => {
  const story = makeStory({
    snapshot_id: "s_nonexistent",
    rationale: "",
    status: "proposed",
    data_version: {
      index_sha256: REAL_INDEX_SHA,
      snapshot_sha256: "x".repeat(64),
    },
  });
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "none");
  assert.equal(ref.reason, "snapshot_not_found");
});

// ── 14. 字节完整性：响应内容变更但 manifest 不变 → verifySnapshotBytes 失败 ──
// 版本身份元数据匹配（resolveStorySnapshotRef 通过）不等于加载字节完整。
// verifySnapshotBytes 实际计算响应字节 sha256 与 manifest 比对。
test("verifySnapshotBytes rejects tampered content even when manifest unchanged", async () => {
  const tamperedBytes = new TextEncoder().encode('{"type":"FeatureCollection","features":[]}');
  const ok = await verifySnapshotBytes(tamperedBytes, MANIFEST, "s_qin_chuhan");
  assert.equal(ok, false, "tampered content must not pass byte verification");
});

// ── 15. 字节完整性：真实内容 → 通过 ───────────────────────────────
test("verifySnapshotBytes passes for correct content", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const realBytes = await readFile(
    fileURLToPath(
      new URL("../public/data/jiangshan/snapshots/s_qin_chuhan.geojson", import.meta.url),
    ),
  );
  const ok = await verifySnapshotBytes(realBytes, MANIFEST, "s_qin_chuhan");
  assert.equal(ok, true);
});

// ── 16. 导出端到端：真实生成的 story JSON 透传 map_ref ─────────────
// 覆盖 wiki frontmatter → export → site sync → generated JSON 的真实属性链。
// 2026-11-11 人工审定生效：项羽 map_ref 由 proposed 翻转为 approved
// （理由 + 版本哈希由用户填写），断言随真数据更新。
test("exported xiang-yu story JSON carries approved map_ref from wiki frontmatter", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const story = JSON.parse(
    await readFile(
      fileURLToPath(
        new URL("../public/data/generated/story-000-xiang-yu-wujiang.json", import.meta.url),
      ),
      "utf8",
    ),
  );
  const mapRef = story.map_plan?.map_ref;
  assert.ok(mapRef, "generated story JSON must carry map_ref");
  assert.equal(mapRef.snapshot_id, "s_qin_chuhan");
  assert.equal(mapRef.status, "approved", "人工审定后 status=approved");
  assert.ok(mapRef.rationale.length > 0, "approved 必须携带人工审定理由");
  assert.ok(mapRef.data_version?.index_sha256, "data_version.index_sha256 bound");
  assert.ok(mapRef.data_version?.snapshot_sha256, "data_version.snapshot_sha256 bound");
});

// ── 17. 真实生成的审定参考经 resolveStorySnapshotRef → approved ──
// proposed 路径的行为覆盖由 §13 fixture 用例（"proposed does not activate"）
// 保证；本用例验证真数据审定后端到端解析为 approved。
test("real generated xiang-yu JSON resolves to approved after human review", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const story = JSON.parse(
    await readFile(
      fileURLToPath(
        new URL("../public/data/generated/story-000-xiang-yu-wujiang.json", import.meta.url),
      ),
      "utf8",
    ),
  );
  const realManifest = JSON.parse(
    await readFile(
      fileURLToPath(new URL("../public/data/jiangshan/manifest.json", import.meta.url)),
      "utf8",
    ),
  );
  const realIndex = JSON.parse(
    await readFile(
      fileURLToPath(new URL("../public/data/jiangshan/index.json", import.meta.url)),
      "utf8",
    ),
  );
  const ref = resolveStorySnapshotRef(realIndex, realManifest, story);
  assert.equal(ref.kind, "approved", "审定 + 版本匹配 → approved");
  assert.equal(ref.snapshot_id, "s_qin_chuhan");
});

// ── 18. 纯底座故事（管宁）真实生成 JSON 无 map_ref → none ──────────
test("real generated guan-ning story has no map_ref → none (hand-drawn base)", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const story = JSON.parse(
    await readFile(
      fileURLToPath(
        new URL("../public/data/generated/story-009-guan-ning-ge-xi.json", import.meta.url),
      ),
      "utf8",
    ),
  );
  const ref = resolveStorySnapshotRef(INDEX, MANIFEST, story);
  assert.equal(ref.kind, "none");
  assert.equal(ref.reason, "no_map_ref");
});

// ── 19. UI 徽章文案：approved/proposed/none/fallback（§2 显示要求）──
test("mapRefBadgeText: approved shows snapshot id + rationale", () => {
  const badge = mapRefBadgeText({
    kind: "approved",
    snapshot_id: "s_qin_chuhan",
    rationale: "测试用理由",
  });
  assert.ok(badge.text.includes("s_qin_chuhan"));
  assert.ok(badge.text.includes("测试用理由"));
  assert.ok(badge.className.includes("approved"));
});

test("mapRefBadgeText: proposed shows candidate + 待人工审定", () => {
  const badge = mapRefBadgeText({
    kind: "proposed",
    snapshot_id: "s_qin_chuhan",
    rationale: "",
  });
  assert.ok(badge.text.includes("待审候选"));
  assert.ok(badge.text.includes("s_qin_chuhan"));
  assert.ok(badge.text.includes("手绘"));
  assert.ok(badge.className.includes("proposed"));
});

test("mapRefBadgeText: none version_mismatch shows fallback text", () => {
  const badge = mapRefBadgeText({ kind: "none", reason: "version_mismatch" });
  assert.ok(badge.text.includes("版本不符"));
  assert.ok(badge.text.includes("回退手绘"));
  assert.ok(badge.className.includes("fallback"));
});

