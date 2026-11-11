// HistoryMapStage 真实组件行为测试（esbuild bundle 真实组件 + 假 maplibre-gl +
// jsdom + createRoot）。覆盖 Phase 2 两项缺陷的真实复现路径：
//
// N1（已修，回归守卫）：approved 故事 + 大区数据 404 → 路线层、地点标记、
//   徽章均不得缺失（局部缺失不坍塌整个故事现场）。
// F3（待修）：在 index 字节校验 digest 的 await 窗口内切故事 → 旧 async 续体
//   不得向已 remove 的旧 map 写图层、不得把旧故事的 approved 徽章污染到新故事现场。
//
// 运行：cd site && node --import tsx --test test/history-map-stage.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { webcrypto } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const componentUrl = new URL("../components/history-map-stage.jsx", import.meta.url);
const componentPath = fileURLToPath(componentUrl);
const componentsDir = dirname(componentPath);
// 唯一 bundle 路径：pid + 随机，避免并发进程互相删除（ENOENT）；只清理自己的。
const bundlePath = fileURLToPath(
  new URL(`./.hms-bundle-${process.pid}-${Math.random().toString(36).slice(2, 10)}.mjs`, import.meta.url),
);

// ── 假 maplibre-gl 模块源（注入 globalThis.__mapRegistry 以便测试观察）────
const FAKE_MAPLIBRE_SRC = `
class FakeMarker {
  constructor(opts) {
    this.opts = opts || {};
    this.removed = false;
    this._el = opts && opts.element ? opts.element : document.createElement("div");
    globalThis.__mapRegistry.markers.push(this);
  }
  setLngLat(c) { this.lng = c; return this; }
  addTo(map) { this.map = map; return this; }
  remove() { this.removed = true; }
}
class FakeMap {
  constructor(opts) {
    this.opts = opts || {};
    this.layers = new Map();
    this.sources = new Map();
    this.paintWrites = [];
    this.featureStates = [];
    this.handlers = {};
    this.removed = false;
    this.writesAfterRemove = 0;
    globalThis.__mapRegistry.instances.push(this);
  }
  on(event, cbOrLayer, maybeCb) { this.handlers[event] = maybeCb || cbOrLayer; return this; }
  _tick() { if (this.removed) this.writesAfterRemove++; }
  addSource(id, spec) { this._tick(); this.sources.set(id, spec); }
  addLayer(spec) { this._tick(); this.layers.set(spec.id, spec); }
  getLayer(id) { return this.layers.get(id) || null; }
  getSource(id) { return this.sources.get(id) || null; }
  setPaintProperty(layer, prop) { this._tick(); this.paintWrites.push([layer, prop]); }
  setFeatureState(target, state) { this._tick(); this.featureStates.push({ target, state }); }
  getStyle() { return { layers: [] }; }
  fitBounds() {}
  flyTo() {}
  remove() { this.removed = true; }
  fireLoad() { if (this.handlers["style.load"]) this.handlers["style.load"](); if (this.handlers["load"]) this.handlers["load"](); }
}
export default { Map: FakeMap, Marker: FakeMarker };
`;

const fakeMaplibrePlugin = {
  name: "fake-maplibre",
  setup(b) {
    b.onResolve({ filter: /^maplibre-gl$/ }, () => ({
      path: "fake-maplibre",
      namespace: "fake-maplibre",
    }));
    b.onLoad({ filter: /.*/, namespace: "fake-maplibre" }, () => ({
      contents: FAKE_MAPLIBRE_SRC,
      loader: "js",
    }));
  },
};

let bundleBuilt = false;
async function buildBundleOnce() {
  if (bundleBuilt) return;
  const result = await build({
    entryPoints: [componentPath],
    bundle: true,
    format: "esm",
    jsx: "automatic",
    splitting: false,
    write: false,
    external: ["react", "react/jsx-runtime"],
    plugins: [fakeMaplibrePlugin],
    logLevel: "silent",
  });
  writeFileSync(bundlePath, result.outputFiles[0].text);
  bundleBuilt = true;
}

async function loadComponent() {
  await buildBundleOnce();
  // bundle 文件位于 test/ 下，bare import（react / react/jsx-runtime）向上解析到
  // site/node_modules，与测试中动态导入的 react-dom/client 共用同一份 React 实例。
  return import(bundlePath);
}

// ── jsdom 全局环境 ───────────────────────────────────────────────
async function setupEnv() {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body><div id='root'></div></body></html>", {
    url: "https://localhost/", // 安全上下文：crypto.subtle 可用（approved 加载路径）
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const defs = {
    window: { value: w, writable: true, configurable: true },
    document: { value: w.document, writable: true, configurable: true },
    HTMLElement: { value: w.HTMLElement, writable: true, configurable: true },
    Element: { value: w.Element, writable: true, configurable: true },
    Node: { value: w.Node, writable: true, configurable: true },
    getComputedStyle: { value: w.getComputedStyle.bind(w), writable: true, configurable: true },
    navigator: { value: w.navigator, writable: true, configurable: true },
    customElements: { value: w.customElements, writable: true, configurable: true },
    MutationObserver: { value: w.MutationObserver, writable: true, configurable: true },
  };
  for (const [k, d] of Object.entries(defs)) {
    try { Object.defineProperty(globalThis, k, d); } catch { /* noop */ }
  }
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  if (!w.HTMLCanvasElement.prototype.getContext) {
    w.HTMLCanvasElement.prototype.getContext = () => null;
  }
  // Node 24 的 globalThis.crypto 已是 webcrypto（只读 getter，不可覆盖）。
  // 组件/jiangshan-data 使用 bare `crypto.subtle`，此处即 webcrypto，approved
  // 字节校验路径可用。digest 钩子通过 defineProperty 在 subtle 实例上覆写。
  // TextEncoder/TextDecoder 已是 Node 全局，无需覆盖。
  return dom;
}

// ── 数据 fixture ─────────────────────────────────────────────────
const SCENE = {
  bounds: [100, 30, 120, 42],
  overlay_boundary: "boundary_chuhan",
  geojson: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { kind: "route", color: "#8B5A2B" },
        geometry: { type: "LineString", coordinates: [[110, 33], [112, 35]] } },
    ],
  },
  markers: [
    { place_id: "p1", kind: "place", subtitle: "起兵" },
    { place_id: "p2", kind: "place", subtitle: "决战" },
  ],
};

function makeApprovedStory(storyId) {
  return {
    story_id: storyId,
    timeline: { year: -202 },
    places: [
      { id: "p1", lng: 110.5, lat: 34.2, map_label: "乌江" },
      { id: "p2", lng: 112.3, lat: 34.8, map_label: "垓下" },
    ],
    scene: SCENE,
    map_plan: { map_ref: { snapshot_id: "s_qin_chuhan", status: "approved",
      rationale: "楚汉对峙审定", data_version: null } }, // data_version 在 setup 里按真实 sha 注入
  };
}

function makeProposedStory(storyId) {
  // proposed 起点：status=proposed，phase 存在即 kind=proposed；不做版本校验。
  // index 字节校验仍运行（与 approved 同路径），F3 竞态洞同样触达。
  return {
    story_id: storyId,
    timeline: { year: -202 },
    places: [
      { id: "p1", lng: 110.5, lat: 34.2, map_label: "乌江" },
      { id: "p2", lng: 112.3, lat: 34.8, map_label: "垓下" },
    ],
    scene: SCENE,
    map_plan: { map_ref: { snapshot_id: "s_qin_chuhan", status: "proposed", rationale: "" } },
  };
}

function makePlainStory(storyId) {
  // 无 map_ref：resolveStorySnapshotRef → none(no_map_ref)，不加载审定快照
  return {
    story_id: storyId,
    timeline: { year: 190 },
    places: [{ id: "q1", lng: 118.7, lat: 36.9, map_label: "北海" }],
    scene: SCENE,
    map_plan: {},
  };
}

async function sha256Hex(bytes) {
  const buf = await webcrypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function buildFixtures() {
  const index = {
    dynasties: [{ key: "qin", title: "秦", from: -221, to: -203, phases: [
      { snapshot: "s_qin_chuhan", from: -206, to: -203,
        file: "snapshots/s_qin_chuhan.geojson", overview: "楚汉" },
    ] }],
  };
  const snapshot = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { title: "楚", tint: "#c98a2b", anchor: [111, 34], display_color: "#E0B070" },
      geometry: { type: "Polygon", coordinates: [[[109, 32], [113, 32], [113, 35], [109, 35], [109, 32]]] },
    }],
  };
  const indexBytes = new TextEncoder().encode(JSON.stringify(index));
  const snapBytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const indexSha = await sha256Hex(indexBytes);
  const snapSha = await sha256Hex(snapBytes);
  const manifest = { output_files: [
    { path: "index.json", sha256: indexSha },
    { path: "snapshots/s_qin_chuhan.geojson", sha256: snapSha },
  ] };
  return { index, indexBytes, snapshot, snapBytes, manifest, indexSha, snapSha };
}

// ── fetch 路由 mock（忽略 signal 以复现旧续体在 abort 后仍推进的竞态）────
function makeFetch(fixtures, { regionsOk = true } = {}) {
  const { indexBytes, snapBytes, manifest } = fixtures;
  const basemapStyle = { version: 8, sources: {}, layers: [] };
  const ok = (body) => ({ ok: true, json: async () => body });
  const okBuf = (bytes) => ({
    ok: true,
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
    arrayBuffer: async () => bytes.slice().buffer,
  });
  return async function fetch(url, opts) {
    void opts;
    const u = String(url);
    if (u.includes("basemaps.cartocdn.com")) return ok(basemapStyle);
    if (u.endsWith("/data/static/regions.geojson")) {
      return regionsOk ? ok({ type: "FeatureCollection", features: [] }) : { ok: false, json: async () => null };
    }
    if (u.endsWith("/data/jiangshan/index.json")) return okBuf(indexBytes);
    if (u.endsWith("/data/jiangshan/manifest.json")) return ok(manifest);
    if (u.endsWith("/data/jiangshan/snapshots/s_qin_chuhan.geojson")) return okBuf(snapBytes);
    if (u.includes("/data/historical/")) return ok({ type: "FeatureCollection", features: [] });
    return { ok: false, json: async () => null };
  };
}

// ── digest 钩子：在第一次 index 字节校验 digest 内可控切换故事 ──────
function installDigestHook(onFirstDigest) {
  const realDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
  let calls = 0;
  const hooked = async function (algo, data) {
    if (calls === 0 && onFirstDigest) {
      onFirstDigest();
      // 让 React 提交 + passive effect（cleanup + 新 effect 启动）冲刷
      await Promise.resolve();
      await Promise.resolve();
    }
    calls++;
    return realDigest(algo, data);
  };
  Object.defineProperty(webcrypto.subtle, "digest", { value: hooked, configurable: true, writable: true });
  return () => {
    Object.defineProperty(webcrypto.subtle, "digest", { value: realDigest, configurable: true, writable: true });
  };
}

function settle(ms = 30) {
  return new Promise((r) => setTimeout(r, ms));
}

function badgeText(document) {
  const el = document.querySelector(".history-map-ref-badge");
  return el ? el.textContent : null;
}

test("N1 回归：approved + regions 404 → 路线/标记/徽章不缺失", async () => {
  await setupEnv();
  const { HistoryMapStage } = await loadComponent();
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");

  globalThis.__mapRegistry = { instances: [], markers: [] };
  const fixtures = await buildFixtures();
  globalThis.fetch = makeFetch(fixtures, { regionsOk: false });

  const story = makeApprovedStory("story_000_xiang_yu_wujiang");
  story.map_plan.map_ref.data_version = {
    index_sha256: fixtures.indexSha,
    snapshot_sha256: fixtures.snapSha,
  };

  const container = document.getElementById("root");
  const root = createRoot(container);
  flushSync(() => {
    root.render(React.createElement(HistoryMapStage, {
      story, onSelectPlace: () => {}, focusRegion: null,
    }));
  });
  await settle(10);
  assert.ok(globalThis.__mapRegistry.instances.length >= 1, "应创建地图实例");
  globalThis.__mapRegistry.instances[0].fireLoad();
  await settle(40);

  const map = globalThis.__mapRegistry.instances[0];
  assert.ok(map.layers.has("story-route-line"), "路线层 story-route-line 必须存在（regions 404 不坍塌）");
  assert.ok(map.sources.has("story001-overlay"), "故事 overlay 源必须存在");
  const placeMarkers = globalThis.__mapRegistry.markers.filter((m) =>
    m._el && m._el.classList && m._el.classList.contains("map-marker"));
  assert.ok(placeMarkers.length >= 2, `应至少装配 2 个地点标记，实际 ${placeMarkers.length}`);
  const badge = badgeText(document);
  assert.ok(badge && badge.includes("审定参考") && badge.includes("s_qin_chuhan"),
    `徽章应显示「审定参考·s_qin_chuhan」，实际：${badge}`);

  flushSync(() => root.unmount());
  await settle(5);
});

test("F3 竞态：index digest 内切故事 → 旧续体不写已 remove 的 map、不污染徽章", async () => {
  await setupEnv();
  const { HistoryMapStage } = await loadComponent();
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");

  globalThis.__mapRegistry = { instances: [], markers: [] };
  const fixtures = await buildFixtures();
  globalThis.fetch = makeFetch(fixtures, { regionsOk: false });

  const xiangYu = makeApprovedStory("story_000_xiang_yu_wujiang");
  xiangYu.map_plan.map_ref.data_version = {
    index_sha256: fixtures.indexSha,
    snapshot_sha256: fixtures.snapSha,
  };
  const guanNing = makePlainStory("story_guan_ning");

  const container = document.getElementById("root");
  const root = createRoot(container);
  flushSync(() => {
    root.render(React.createElement(HistoryMapStage, {
      story: xiangYu, onSelectPlace: () => {}, focusRegion: null,
    }));
  });
  await settle(10);
  const xiangYuMap = globalThis.__mapRegistry.instances[0];
  assert.ok(xiangYuMap, "项羽故事应创建地图");

  let switched = false;
  const restoreDigest = installDigestHook(() => {
    flushSync(() => {
      root.render(React.createElement(HistoryMapStage, {
        story: guanNing, onSelectPlace: () => {}, focusRegion: null,
      }));
    });
    switched = true;
  });

  // 触发项羽地图 load → 进入 Promise.all 续体 → 第一次 digest（index 校验）
  xiangYuMap.fireLoad();
  await settle(50);
  restoreDigest();

  assert.ok(switched, "切故事应在第一次 digest 内发生");
  const oldMap = xiangYuMap;
  assert.ok(oldMap.removed, "旧地图应已被 remove");

  const writesAfterRemove = oldMap.writesAfterRemove;
  const badge = badgeText(document);
  assert.equal(writesAfterRemove, 0,
    `旧续体不得向已 remove 的 map 写图层，实际 writesAfterRemove=${writesAfterRemove}`);
  assert.ok(!badge || !badge.includes("s_qin_chuhan"),
    `徽章不得残留旧故事审定参考，实际：${badge}`);

  flushSync(() => root.unmount());
  await settle(5);
});

test("F3 竞态（proposed 起点 + 大区正常路径）：index digest 内切故事 → 旧续体不写旧 map、不污染徽章", async () => {
  await setupEnv();
  const { HistoryMapStage } = await loadComponent();
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");

  globalThis.__mapRegistry = { instances: [], markers: [] };
  const fixtures = await buildFixtures();
  // 大区正常路径：regions 存在（非 404）
  globalThis.fetch = makeFetch(fixtures, { regionsOk: true });

  const xiangYu = makeProposedStory("story_000_xiang_yu_wujiang");
  const guanNing = makePlainStory("story_guan_ning");

  const container = document.getElementById("root");
  const root = createRoot(container);
  flushSync(() => {
    root.render(React.createElement(HistoryMapStage, {
      story: xiangYu, onSelectPlace: () => {}, focusRegion: null,
    }));
  });
  await settle(10);
  const xiangYuMap = globalThis.__mapRegistry.instances[0];
  assert.ok(xiangYuMap, "项羽故事应创建地图");

  let switched = false;
  const restoreDigest = installDigestHook(() => {
    flushSync(() => {
      root.render(React.createElement(HistoryMapStage, {
        story: guanNing, onSelectPlace: () => {}, focusRegion: null,
      }));
    });
    switched = true;
  });

  // 触发项羽地图 load → 进入 Promise.all 续体 → 第一次 digest（index 校验）
  xiangYuMap.fireLoad();
  await settle(50);
  restoreDigest();

  assert.ok(switched, "切故事应在第一次 digest 内发生");
  const oldMap = xiangYuMap;
  assert.ok(oldMap.removed, "旧地图应已被 remove");

  // proposed 起点：旧续体在 digest 后无守卫会 setMapRefStatus(proposed-项羽)
  // 污染徽章（待审候选·s_qin_chuhan），并向已 remove 旧 map 写
  // history-regions / regions-fill / story001-overlay / story-route-line 等多层。
  const writesAfterRemove = oldMap.writesAfterRemove;
  const badge = badgeText(document);
  assert.equal(writesAfterRemove, 0,
    `旧续体不得向已 remove 的 map 写图层，实际 writesAfterRemove=${writesAfterRemove}`);
  assert.ok(!badge || !badge.includes("s_qin_chuhan"),
    `徽章不得残留旧故事候选/审定参考，实际：${badge}`);

  flushSync(() => root.unmount());
  await settle(5);
});

// 退出前清理自己的临时 bundle（不影响工作树；并发进程各自唯一路径）
test.after(() => {
  try { if (bundleBuilt) unlinkSync(bundlePath); } catch { /* noop */ }
});
// 进程退出兜底：test.after 未跑（崩溃）也尽量清自己的文件
process.on("exit", () => {
  try { if (bundleBuilt) unlinkSync(bundlePath); } catch { /* noop */ }
});
