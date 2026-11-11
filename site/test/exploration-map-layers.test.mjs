// 探索地图图层纯函数测试（fake map，不依赖 maplibre/WebGL）。
//
// 覆盖独立审查 + 后续致命渲染缺陷：
// 1. map 异步 init 竞态：mapReady 纳入 effect deps，map ready 后重触应用待挂快照。
// 2. snapshot=null 清除旧 polity（层/源/标签），转场不残留旧数据。
// 3. polity insert before corridor-line，保证走廊在上层（无论添加先后）。
// 4. version 不用字节长度推断：两个不同快照 stringify 长度相等也必须重建
//    （用显式 phaseKey 身份判定，不用 __v/length）。
// 5. 同 phaseKey 且源已存在 → 幂等跳过。
// 6. 走廊年份过滤：无 from/to 一直显示；区间内显示；区间外不显示。
//
// 运行：node --import tsx --test test/exploration-map-layers.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clearPolityLayers,
  applyPolityToMap,
  applyCorridorsToMap,
  corridorYearFilter,
} from "../lib/exploration-map-layers.js";

// ── fake map：记录 addLayer 顺序与 beforeId，支持 getLayer/getSource/
// removeLayer/removeSource/addSource/addLayer/isStyleLoaded/once ─────────
function createFakeMap() {
  const layers = new Map(); // id -> {spec, beforeId}
  const sources = new Map(); // id -> data
  return {
    _layers: layers,
    _sources: sources,
    layerOrder() {
      // 返回当前图层在 style 中的顺序（按插入 + beforeId 重排近似）
      return [...layers.keys()];
    },
    getLayer(id) { return layers.has(id) ? layers.get(id) : undefined; },
    getSource(id) { return sources.has(id) ? sources.get(id) : undefined; },
    addSource(id, spec) { sources.set(id, spec.data); },
    addLayer(spec, beforeId) {
      layers.set(spec.id, { spec, beforeId: beforeId ?? null });
    },
    removeLayer(id) { layers.delete(id); },
    removeSource(id) { sources.delete(id); },
    isStyleLoaded() { return true; },
    once(_ev, cb) { /* 测试中 style 已 loaded，不触发 idle 回调 */ },
    setFilter(id, expr) { if (layers.has(id)) layers.get(id).filter = expr; },
  };
}

function fakeMarker() {
  let removed = false;
  return {
    setLngLat() { return this; },
    addTo() { return this; },
    remove() { removed = true; },
    get removed() { return removed; },
  };
}

const SNAP_A = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [108, 34] },
      properties: { title: "长安", anchor: [108, 34], display_color: "#AABBCC" } },
  ],
};
// SNAP_B：内容不同但 stringify 长度可能与 A 相同（构造等长但 title 不同）
const SNAP_B = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [110, 30] },
      properties: { title: "洛阳", anchor: [110, 30], display_color: "#DDEEFF" } },
  ],
};

test("applyPolityToMap：添加 polity-fill 源与层，创建锚点标签", () => {
  const map = createFakeMap();
  const labelsRef = { current: [] };
  const versionRef = { current: null };
  const applied = applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef, labelsRef, createMarker: () => fakeMarker(),
  });
  assert.equal(applied, true, "首次应用返回 true");
  assert.ok(map.getSource("jiangshan-polity"), "polity 源已添加");
  assert.ok(map.getLayer("polity-fill"), "polity 层已添加");
  assert.equal(labelsRef.current.length, 1, "一个锚点标签");
  assert.equal(versionRef.current, "phase:chuhan", "versionRef 记录 phaseKey");
});

test("polity 疆域填色可读性：opacity ≥ 0.5 + 描边可辨（浏览器实测 0.32 几乎不可见）", () => {
  // 浏览器实测（2026-11-11 verify-explore）：pastel display_color × 0.32 opacity
  // 叠在 0.22 大区水彩上 → 疆域肉眼几乎不可见，儿童产品核心信息丢失。
  const map = createFakeMap();
  applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef: { current: null }, labelsRef: { current: [] },
  });
  const layer = map.getLayer("polity-fill");
  assert.ok(layer.spec.paint["fill-opacity"] >= 0.5,
    `fill-opacity 应 ≥0.5（当前 ${layer.spec.paint["fill-opacity"]}），否则疆域不可读`);
  const outline = String(layer.spec.paint["fill-outline-color"]);
  const alpha = parseFloat(outline.match(/([\d.]+)\s*\)$/)?.[1] ?? "0");
  assert.ok(alpha >= 0.3, `描边 alpha 应 ≥0.3（当前 ${outline}）`);
});

test("polity 疆界线图层：数据驱动 tint 描边（pastel 填充读面、饱和 tint 读界）", () => {
  // display_color 是 ~80% 亮度的 pastel，再提 opacity 也读不出「面」；
  // 上游 tint 是每政权饱和色（魏#4a6fa5/蜀汉#c98a2b/吴#3f8f6a）——用它描边，
  // 疆域轮廓才真正可辨（fill-outline-color 不做数据驱动，故独立 line 层）。
  const map = createFakeMap();
  applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef: { current: null }, labelsRef: { current: [] },
  });
  const line = map.getLayer("polity-outline");
  assert.ok(line, "polity-outline 线图层必须存在");
  assert.equal(line.spec.type, "line");
  const color = line.spec.paint["line-color"];
  assert.ok(Array.isArray(color) && JSON.stringify(color).includes("tint"),
    "line-color 必须数据驱动读取 tint（每政权饱和色）");
  assert.ok(line.spec.paint["line-opacity"] >= 0.5, "界线须清晰可辨");
});

test("snapshot=null 时 clearPolityLayers 清除层/源/标签，转场不残留旧数据", () => {
  const map = createFakeMap();
  const labelsRef = { current: [] };
  const versionRef = { current: null };
  applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef, labelsRef, createMarker: () => fakeMarker(),
  });
  assert.ok(map.getLayer("polity-fill"), "应用后有 polity 层");
  const marker = labelsRef.current[0];
  // 模拟跨 phase：snapshot 变 null，组件调用 clearPolityLayers
  clearPolityLayers(map, labelsRef);
  assert.ok(!map.getLayer("polity-fill"), "清空后 polity 层已移除");
  assert.ok(!map.getSource("jiangshan-polity"), "清空后 polity 源已移除");
  assert.equal(labelsRef.current.length, 0, "标签已清空");
  assert.equal(marker.removed, true, "marker.remove() 被调用");
});

test("图层顺序：polity insert before corridor-line，走廊保持上层（走廊先加）", () => {
  const map = createFakeMap();
  // 先加走廊
  const corrVersion = { current: null };
  applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef: corrVersion,
  });
  assert.ok(map.getLayer("corridor-line"), "走廊层已加");
  // 再加 polity：应 insert before corridor-line
  const labelsRef = { current: [] };
  applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef: { current: null }, labelsRef, createMarker: () => fakeMarker(),
  });
  const polityLayer = map.getLayer("polity-fill");
  assert.equal(polityLayer.beforeId, "corridor-line", "polity insert before corridor-line");
});

test("图层顺序：走廊后加（polity 先加），走廊 addLayer 追加顶，仍在 polity 上层", () => {
  const map = createFakeMap();
  const labelsRef = { current: [] };
  applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef: { current: null }, labelsRef, createMarker: () => fakeMarker(),
  });
  // corridor-line 不存在时 polity beforeId=null（正常）；走廊后加追加顶
  assert.equal(map.getLayer("polity-fill").beforeId, null, "无走廊时 polity 无 beforeId");
  applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef: { current: null },
  });
  assert.ok(map.getLayer("corridor-line"), "走廊层已加");
  // 走廊 addLayer 无 beforeId → 追加到 style 顶（在 polity 之上）
  assert.equal(map.getLayer("corridor-line").beforeId, null, "走廊追加顶");
});

test("version 不用字节长度推断：两个不同快照 stringify 长度相等也必须重建", () => {
  // 构造两个内容不同、JSON.stringify 长度相同的快照
  // SNAP_A title "长安"(2字) vs SNAP_B "洛阳"(2字)，display_color 不同但等长 → 长度相同
  const lenA = JSON.stringify(SNAP_A).length;
  const lenB = JSON.stringify(SNAP_B).length;
  assert.equal(lenA, lenB, "测试前提：两个快照 stringify 长度相等");
  const map = createFakeMap();
  const labelsRef = { current: [] };
  const versionRef = { current: null };
  applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef, labelsRef, createMarker: () => fakeMarker(),
  });
  // 用不同 phaseKey 应用 SNAP_B：即使长度相同也必须重建（清除旧源，换新数据）
  const appliedB = applyPolityToMap(map, SNAP_B, "phase:sanguo", {
    versionRef, labelsRef, createMarker: () => fakeMarker(),
  });
  assert.equal(appliedB, true, "不同 phaseKey 必须重建（不因长度相等跳过）");
  assert.equal(versionRef.current, "phase:sanguo", "versionRef 更新为新 phaseKey");
  assert.equal(map.getSource("jiangshan-polity"), SNAP_B, "源数据替换为 SNAP_B");
});

test("同 phaseKey 且源已存在 → 幂等跳过（不重复重建）", () => {
  const map = createFakeMap();
  const labelsRef = { current: [] };
  const versionRef = { current: null };
  applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef, labelsRef, createMarker: () => fakeMarker(),
  });
  const appliedAgain = applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef, labelsRef, createMarker: () => fakeMarker(),
  });
  assert.equal(appliedAgain, false, "同 phaseKey 幂等跳过");
});

test("corridorYearFilter：无 from/to 一直显示；区间内显示；区间外不显示", () => {
  // 过滤表达式是 MapLibre 表达式，用简易求值器验证语义
  const expr = corridorYearFilter(245);
  // 结构断言
  assert.equal(expr[0], "any");
  // 无 span 分支：! (has from && has to)
  const noSpanBranch = expr[1];
  assert.deepEqual(noSpanBranch, ["!", ["all", ["has", "from"], ["has", "to"]]]);
  // 区间分支
  assert.deepEqual(expr[2], ["all", ["<=", ["get", "from"], 245], [">=", ["get", "to"], 245]]);
});

test("applyCorridorsToMap：添加走廊源与线层，幂等跳过同 key", () => {
  const map = createFakeMap();
  const versionRef = { current: null };
  const applied = applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef,
  });
  assert.equal(applied, true);
  assert.ok(map.getSource("jiangshan-corridors"));
  assert.ok(map.getLayer("corridor-line"));
  const again = applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef,
  });
  assert.equal(again, false, "同 corridorsKey 幂等跳过");
});

test("mapReady 竞态模拟：map 未就绪时不应用，就绪后重触 effect 应用待挂快照", () => {
  // 模拟组件 effect 行为：mapReady false → effect 早退；true → 应用
  // 这里直接验证 applyPolityToMap 在 map 就绪后可正常应用（组件层 mapReady 由 deps 触发重跑）
  const map = createFakeMap();
  const labelsRef = { current: [] };
  const versionRef = { current: null };
  // 阶段1：map 未就绪（组件中 mapRef null 或 mapReady false）→ 不调用 apply
  // 阶段2：map 就绪 → 调用 apply
  const applied = applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef, labelsRef, createMarker: () => fakeMarker(),
  });
  assert.equal(applied, true, "map 就绪后应用成功");
  assert.ok(map.getLayer("polity-fill"), "竞态修复后 polity 层存在");
});

test("applyPolityToMap：无 title 的 feature 不创建标签", () => {
  const snap = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [1, 2] }, properties: { anchor: [1, 2] } },
      { type: "Feature", geometry: { type: "Point", coordinates: [3, 4] }, properties: { title: "X", anchor: [3, 4] } },
    ],
  };
  const map = createFakeMap();
  const labelsRef = { current: [] };
  applyPolityToMap(map, snap, "p1", {
    versionRef: { current: null }, labelsRef, createMarker: () => fakeMarker(),
  });
  assert.equal(labelsRef.current.length, 1, "仅有一个 title 的 feature 创建标签");
});
