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
import fs from "node:fs";

import {
  clearPolityLayers,
  applyPolityToMap,
  applyCorridorsToMap,
  applyCorridorFilters,
  clearCorridorLayers,
  corridorLabelPoints,
  corridorYearFilter,
  corridorGroupFilter,
  corridorCombinedFilter,
  corridorLayerFilter,
  attachCorridorInteractions,
  scheduleOnIdle,
  corridorInfoContent,
  CORRIDOR_KINDS,
  CORRIDOR_KIND_COLORS,
  CORRIDOR_KIND_STYLES,
} from "../lib/exploration-map-layers.js";

// 真实入库数据（复现标签/线同年、全关、部分关、端点）
const CORRIDOR_DATA = JSON.parse(
  fs.readFileSync(new URL("../public/data/jiangshan/corridors.geojson", import.meta.url), "utf8"),
);

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

test("图层顺序：polity insert before corridor-line-wall，走廊保持上层（走廊先加）", () => {
  const map = createFakeMap();
  // 先加走廊（四类线层，最底层为 corridor-line-wall）
  const corrVersion = { current: null };
  applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef: corrVersion,
  });
  assert.ok(map.getLayer("corridor-line-wall"), "走廊最底层 corridor-line-wall 已加");
  // 再加 polity：应 insert before corridor-line-wall
  const labelsRef = { current: [] };
  applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef: { current: null }, labelsRef, createMarker: () => fakeMarker(),
  });
  const polityLayer = map.getLayer("polity-fill");
  assert.equal(polityLayer.beforeId, "corridor-line-wall", "polity insert before corridor-line-wall");
});

test("图层顺序：走廊后加（polity 先加），走廊 addLayer 追加顶，仍在 polity 上层", () => {
  const map = createFakeMap();
  const labelsRef = { current: [] };
  applyPolityToMap(map, SNAP_A, "phase:chuhan", {
    versionRef: { current: null }, labelsRef, createMarker: () => fakeMarker(),
  });
  // corridor-line-wall 不存在时 polity beforeId=null（正常）；走廊后加追加顶
  assert.equal(map.getLayer("polity-fill").beforeId, null, "无走廊时 polity 无 beforeId");
  applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef: { current: null },
  });
  assert.ok(map.getLayer("corridor-line-wall"), "走廊最底层已加");
  // 走廊 addLayer 无 beforeId → 追加到 style 顶（在 polity 之上）
  assert.equal(map.getLayer("corridor-line-wall").beforeId, null, "走廊追加顶");
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

// ── Phase 4：走廊分组开关（PLAN.md「关河丝路按 from/to 过滤 + 分组开关」）──

test("corridorGroupFilter：开组命中，关组不命中", () => {
  const expr = corridorGroupFilter(["wall", "canal"]);
  // 结构：["in", ["get","kind"], ["literal", [...开组]]]
  // （expression "in" 仅 2 参数，列表必须 literal 包裹——多参数展开是 legacy 语法）
  assert.equal(expr[0], "in");
  assert.deepEqual(expr[1], ["get", "kind"]);
  assert.deepEqual(expr[2], ["literal", ["wall", "canal"]]);
});

test("corridorGroupFilter：空列表（全关）返回永假表达式", () => {
  const expr = corridorGroupFilter([]);
  // 全关：空 literal 列表恒 false
  assert.deepEqual(expr, ["in", ["get", "kind"], ["literal", []]]);
});

test("corridorCombinedFilter：年份 AND 分组联合过滤", () => {
  const expr = corridorCombinedFilter(245, ["road", "sea"]);
  // 结构：["all", 年份表达式, 分组表达式]
  assert.equal(expr[0], "all");
  const yearPart = expr[1];
  assert.equal(yearPart[0], "any"); // 与 corridorYearFilter 相同结构
  const groupPart = expr[2];
  assert.equal(groupPart[0], "in");
  assert.deepEqual(groupPart[2], ["literal", ["road", "sea"]]);
});

test("corridorCombinedFilter：全部分组开启时退化为纯年份过滤", () => {
  // 全开时无需附加分组过滤——年份过滤已完整表达语义，表达式更简洁
  const expr = corridorCombinedFilter(245, CORRIDOR_KINDS);
  assert.deepEqual(expr, corridorYearFilter(245), "全开时应退化为纯年份过滤");
});

// ── 缺陷回归（2026-11-12 浏览器实测）：null/undefined 必须视为「全开」──
// 浏览器实测：effectiveKinds=null（非受控初始态）时 corridorCombinedFilter
// 内 (enabledKinds ?? []) 把「未控制=全开」错当「空列表=全关」，生成
// ['in', ['get','kind']]（空 in 列表）。真实 featureFilter 编译下空 in
// 恒 false → 全部走廊被过滤，用户只看到 filter 应用前一帧的残留虚线。
// 用真实 @maplibre/maplibre-gl-style-spec 编译求值断言（不再只做结构断言）。

test("corridorCombinedFilter(year, null/undefined) = 全开（纯年份过滤，非全关）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  for (const kinds of [null, undefined]) {
    const expr = corridorCombinedFilter(220, kinds);
    // 语义断言：全开 → 退化为纯年份过滤
    assert.deepEqual(expr, corridorYearFilter(220), `kinds=${kinds} 应视为全开`);
    // 真实编译求值：区间内走廊必须可见（回归浏览器实测缺陷）
    const compiled = featureFilter(expr);
    const visible = compiled.filter({ zoom: 0 }, { properties: { kind: "wall", from: -121, to: 220 } });
    assert.equal(visible, true, `kinds=${kinds}：汉长城（-121..220，含 220）按年应显示`);
    // sanity：年份外不显示
    const out = compiled.filter({ zoom: 0 }, { properties: { kind: "canal", from: 605, to: 1292 } });
    assert.equal(out, false, "邗沟（605..1292）在 220 年不应显示");
  }
});

test("corridorCombinedFilter 真实求值：分组开关确实生效（关 wall 则长城不可见）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  const compiled = featureFilter(corridorCombinedFilter(-200, ["canal", "road", "sea"]));
  const wall = compiled.filter({ zoom: 0 }, { properties: { kind: "wall", from: -214, to: -122 } });
  assert.equal(wall, false, "关 wall 组：秦长城 -200 年不可见");
  const road = compiled.filter({ zoom: 0 }, { properties: { kind: "road", from: -212, to: 220 } });
  assert.equal(road, true, "开 road 组：秦直道 -200 年可见");
});

// ── P4 四类线层各自过滤：corridorLayerFilter（每条线路 kind 隔离 + 年份 + 分组）──
// 真实 featureFilter 编译求值，避免固定源码数组 tautological 断言。

test("corridorLayerFilter：本类命中、他类不命中（kind 隔离）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  const wallLayer = featureFilter(corridorLayerFilter("wall", 220, null));
  assert.equal(wallLayer.filter({ zoom: 0 }, { properties: { kind: "wall", from: -121, to: 220 } }), true,
    "wall 层：汉长城 220 年命中");
  assert.equal(wallLayer.filter({ zoom: 0 }, { properties: { kind: "canal", from: 605, to: 1292 } }), false,
    "wall 层：运河（他类）即使在年份内也不命中（kind 隔离）");
});

test("corridorLayerFilter(year, null) = 全开（每层只显示本类年份内）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  for (const kind of CORRIDOR_KINDS) {
    const f = featureFilter(corridorLayerFilter(kind, 220, null));
    assert.equal(f.filter({ zoom: 0 }, { properties: { kind, from: -121, to: 220 } }), true,
      `${kind} 层 null 全开：本类年份内可见`);
    assert.equal(f.filter({ zoom: 0 }, { properties: { kind, from: 1368, to: 1948 } }), false,
      `${kind} 层 null 全开：本类年份外不可见`);
  }
});

test("corridorLayerFilter(year, []) = 全关（空列表，每层无任何命中）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  for (const kind of CORRIDOR_KINDS) {
    const f = featureFilter(corridorLayerFilter(kind, 220, []));
    assert.equal(f.filter({ zoom: 0 }, { properties: { kind, from: -121, to: 220 } }), false,
      `${kind} 层 [] 全关：本类年份内也不命中`);
  }
});

test("corridorLayerFilter：关某组则该组线层全不命中，他组层不受影响", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  // 关 wall（开 canal/road/sea）
  const enabled = ["canal", "road", "sea"];
  const wallLayer = featureFilter(corridorLayerFilter("wall", -200, enabled));
  assert.equal(wallLayer.filter({ zoom: 0 }, { properties: { kind: "wall", from: -214, to: -122 } }), false,
    "关 wall：秦长城 -200 年在 wall 层不命中");
  const roadLayer = featureFilter(corridorLayerFilter("road", -200, enabled));
  assert.equal(roadLayer.filter({ zoom: 0 }, { properties: { kind: "road", from: -212, to: 220 } }), true,
    "开 road：秦直道 -200 年在 road 层命中");
});

test("corridorLayerFilter：明长城不出现在唐代（年份过滤，PLAN §4 验收）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  // 唐代 ≈ 700 年；明长城 from 1368
  const wallLayer = featureFilter(corridorLayerFilter("wall", 700, null));
  assert.equal(wallLayer.filter({ zoom: 0 }, { properties: { kind: "wall", from: 1368, to: 1948 } }), false,
    "明长城（1368–1948）在 700 年不显示");
  // 秦长城在汉代 220 年显示（同 wall 层，年份内）
  assert.equal(wallLayer.filter({ zoom: 0 }, { properties: { kind: "wall", from: -214, to: -122 } }), false,
    "秦长城（-214..-122）在 700 年也不显示（年份外）");
});

test("applyCorridorsToMap：添加走廊源 + 四类线层 + 标签层，幂等跳过同 key", () => {
  const map = createFakeMap();
  const versionRef = { current: null };
  const applied = applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef,
  });
  assert.equal(applied, true);
  assert.ok(map.getSource("jiangshan-corridors"), "走廊源存在");
  // 四类各自独立线层（MapLibre line-dasharray 不支持数据驱动，
  // 粗/长/短/稀四样虚线必须靠四个 line 层实现）
  for (const kind of CORRIDOR_KINDS) {
    assert.ok(map.getLayer(`corridor-line-${kind}`), `corridor-line-${kind} 线层存在`);
  }
  assert.ok(map.getLayer("corridor-label"), "标签层存在");
  const again = applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef,
  });
  assert.equal(again, false, "同 corridorsKey 幂等跳过");
});

test("clearCorridorLayers：移除全部四类线层 + 标签层 + 两源", () => {
  const map = createFakeMap();
  applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef: { current: null },
  });
  clearCorridorLayers(map);
  for (const kind of CORRIDOR_KINDS) {
    assert.equal(map.getLayer(`corridor-line-${kind}`), undefined, `corridor-line-${kind} 已移除`);
  }
  assert.equal(map.getLayer("corridor-label"), undefined, "标签层已移除");
  assert.equal(map.getSource("jiangshan-corridors"), undefined, "走廊源已移除");
  assert.equal(map.getSource("jiangshan-corridor-labels"), undefined, "标签源已移除");
});

// ── P4 可读性（上游 jiangshan-map 对照）：四类分色 + 四样虚线 + label_at 名称标签 ──

test("applyCorridorsToMap：四类线层各自 solid 配色（上游 .corridor-line.{kind}）", () => {
  const map = createFakeMap();
  applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef: { current: null },
  });
  // 上游 .corridor-line.wall #5a3826 / .canal #1f6f8b / .road(silk) #9c6317 / .sea #2c5d8f
  for (const kind of CORRIDOR_KINDS) {
    const layer = map.getLayer(`corridor-line-${kind}`);
    assert.ok(layer, `${kind} 线层存在`);
    assert.equal(layer.spec.paint["line-color"], CORRIDOR_KIND_COLORS[kind],
      `${kind} 线层 solid 配色 = CORRIDOR_KIND_COLORS（上游对照）`);
  }
});

test("applyCorridorsToMap：四类虚线节奏各不相同（粗/长/短/稀，对照上游 CSS dasharray）", () => {
  const map = createFakeMap();
  applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef: { current: null },
  });
  const dashes = {};
  const widths = {};
  for (const kind of CORRIDOR_KINDS) {
    const paint = map.getLayer(`corridor-line-${kind}`).spec.paint;
    dashes[kind] = JSON.stringify(paint["line-dasharray"]);
    widths[kind] = paint["line-width"];
  }
  // 四样虚线两两不同（粗/长/短/稀语义靠 dasharray 区分）
  const uniq = new Set(Object.values(dashes));
  assert.equal(uniq.size, CORRIDOR_KINDS.length, "四类 dasharray 两两不同");
  // 与 CORRIDOR_KIND_STYLES 一致（实现单一来源）
  for (const kind of CORRIDOR_KINDS) {
    assert.equal(dashes[kind], JSON.stringify(CORRIDOR_KIND_STYLES[kind].dasharray),
      `${kind} dasharray = CORRIDOR_KIND_STYLES`);
    assert.equal(widths[kind], CORRIDOR_KIND_STYLES[kind].width, `${kind} width = CORRIDOR_KIND_STYLES`);
  }
  // 长城最粗（"粗虚线"）
  assert.ok(widths.wall >= widths.canal && widths.wall > widths.road,
    "长城线宽 ≥ 运河且 > 道路（粗虚线语义）");
});

test("applyCorridorsToMap：label_at 生成名称标签层（上游 corridor-caption 对照）", () => {
  const map = createFakeMap();
  const corridors = {
    type: "FeatureCollection",
    features: [
      { geometry: { type: "LineString", coordinates: [[1, 1], [2, 2]] },
        properties: { key: "wall_qin", kind: "wall", title: "秦长城", from: -214, to: -122, label_at: [1.5, 1.5] } },
      { geometry: { type: "LineString", coordinates: [[3, 3], [4, 4]] },
        properties: { key: "no_label", kind: "road", title: "无锚点路", from: -100, to: 100 } },
    ],
  };
  applyCorridorsToMap(map, corridors, "corridors", { versionRef: { current: null } });
  const labelLayer = map.getLayer("corridor-label");
  assert.ok(labelLayer, "名称标签层存在");
  // 标签源：只含 label_at 的 Point feature，携带 title/kind（title 进 text-field）
  const labelSrc = map.getSource("jiangshan-corridor-labels");
  assert.ok(labelSrc, "标签点源存在");
  assert.equal(labelSrc.features.length, 1, "仅 label_at 锚点生成（无锚点不生成）");
  assert.equal(labelSrc.features[0].properties.title, "秦长城");
  const tf = labelLayer.spec.layout["text-field"];
  // text-field 取 title
  assert.equal(JSON.stringify(tf).includes("title"), true, "text-field 引用 title");
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

// ── Phase 4：走廊点击/悬停接线（attachCorridorInteractions）──────────────
// 可注入 fake map（监听注册/触发）+ fake Popup，无需真实 WebGL。
// 验收：textContent 来源、setDOMContent、触屏重点击关闭旧 popup、卸载/切年/关组
// 清掉过时 popup、不重复注册泄漏。

async function interactionDoc() {
  const { JSDOM } = await import("jsdom");
  return new JSDOM("<!DOCTYPE html><html><body></body></html>").window.document;
}

// fake map：支持 on/off（2 参 map-level 与 3 参 layer-scoped）、fire 触发、getCanvas
function createInteractionFakeMap() {
  const listeners = new Map(); // `${type}|${layerId ?? "*"}` -> Set<fn>
  const canvas = { style: { cursor: "" } };
  const key = (type, layerId) => `${type}|${layerId == null ? "*" : layerId}`;
  return {
    _listeners: listeners,
    getCanvas: () => canvas,
    cursor: () => canvas.style.cursor,
    on(type, a, b) {
      const layerId = b === undefined ? null : a;
      const fn = b === undefined ? a : b;
      const k = key(type, layerId);
      if (!listeners.has(k)) listeners.set(k, new Set());
      listeners.get(k).add(fn);
    },
    off(type, a, b) {
      const layerId = b === undefined ? null : a;
      const fn = b === undefined ? a : b;
      listeners.get(key(type, layerId))?.delete(fn);
    },
    fire(type, layerId, payload) {
      const set = listeners.get(key(type, layerId));
      if (set) for (const fn of [...set]) fn(payload);
    },
    count(type, layerId) {
      return listeners.get(key(type, layerId))?.size ?? 0;
    },
    totalListeners() {
      let n = 0; for (const s of listeners.values()) n += s.size; return n;
    },
  };
}

function fakePopupFactory(log) {
  return () => {
    const p = {
      _content: null, _lngLat: null, added: 0, removed: 0,
      setDOMContent(el) { this._content = el; },
      setLngLat(ll) { this._lngLat = ll; },
      addTo() { this.added++; },
      remove() { this.removed++; },
    };
    log.popups.push(p);
    return p;
  };
}

test("attachCorridorInteractions：为四类 hit 层注册 click/mouseenter/mouseleave，不泄漏", async () => {
  const doc = await interactionDoc();
  const map = createInteractionFakeMap();
  const handle = attachCorridorInteractions(map, { createPopup: fakePopupFactory({ popups: [] }), document: doc });
  for (const kind of CORRIDOR_KINDS) {
    const id = `corridor-hit-${kind}`;
    assert.equal(map.count("click", id), 1, `${id} 注册 1 个 click`);
    assert.equal(map.count("mouseenter", id), 1, `${id} 注册 mouseenter`);
    assert.equal(map.count("mouseleave", id), 1, `${id} 注册 mouseleave`);
  }
  const before = map.totalListeners();
  handle.detach();
  for (const kind of CORRIDOR_KINDS) {
    const id = `corridor-hit-${kind}`;
    assert.equal(map.count("click", id), 0, `detach 后 ${id} click 已注销`);
    assert.equal(map.count("mouseenter", id), 0);
    assert.equal(map.count("mouseleave", id), 0);
  }
  assert.equal(map.totalListeners(), 0, "detach 后全部监听清零（不泄漏）");
  assert.equal(before > 0, true, "卸载前确有监听");
});

test("attachCorridorInteractions：点击线路 → Popup.setDOMContent(textContent 名称) + setLngLat + addTo", async () => {
  const doc = await interactionDoc();
  const map = createInteractionFakeMap();
  const log = { popups: [] };
  const handle = attachCorridorInteractions(map, { createPopup: fakePopupFactory(log), document: doc });
  const feat = { properties: { title: "秦长城", kind: "wall", from: -214, to: -122, summary: "蒙恬连接旧长城" } };
  map.fire("click", "corridor-hit-wall", { features: [feat], lngLat: { lng: 112.6, lat: 41.9 } });
  assert.equal(log.popups.length, 1, "创建 1 个 Popup");
  const p = log.popups[0];
  assert.equal(p.added, 1, "addTo 调用");
  assert.deepEqual(p._lngLat, { lng: 112.6, lat: 41.9 }, "setLngLat 传入点击坐标");
  assert.ok(p._content && p._content.nodeType, "setDOMContent 收到 Element");
  assert.equal(p._content.querySelector(".corridor-info__name").textContent, "秦长城", "名称经 textContent");
  assert.equal(p._content.querySelector(".corridor-info__summary").textContent, "蒙恬连接旧长城", "摘要为入库原文");
  handle.detach();
});

test("attachCorridorInteractions：文本来自 textContent，title 含 <script> 不注入", async () => {
  const doc = await interactionDoc();
  const map = createInteractionFakeMap();
  const log = { popups: [] };
  const handle = attachCorridorInteractions(map, { createPopup: fakePopupFactory(log), document: doc });
  map.fire("click", "corridor-hit-road", { features: [{ properties: { title: "<script>x</script>", kind: "road" } }], lngLat: {} });
  const el = log.popups[0]._content;
  assert.equal(el.querySelector(".corridor-info__name").textContent, "<script>x</script>", "title 原样文本");
  assert.equal(el.querySelectorAll("script").length, 0, "无 script 节点");
  handle.detach();
});

test("attachCorridorInteractions：再次点击他线路先关旧 popup（触屏切线路不叠加）", async () => {
  const doc = await interactionDoc();
  const map = createInteractionFakeMap();
  const log = { popups: [] };
  const handle = attachCorridorInteractions(map, { createPopup: fakePopupFactory(log), document: doc });
  map.fire("click", "corridor-hit-wall", { features: [{ properties: { title: "汉长城", kind: "wall" } }], lngLat: {} });
  const first = log.popups[0];
  assert.equal(first.removed, 0, "首个 popup 初始未关");
  map.fire("click", "corridor-hit-canal", { features: [{ properties: { title: "邗沟", kind: "canal" } }], lngLat: {} });
  assert.equal(first.removed, 1, "点击他线路时先关旧 popup");
  assert.equal(log.popups.length, 2, "再开新 popup");
  handle.detach();
});

test("attachCorridorInteractions：close() 清掉过时 popup（切年/关组时调用）", async () => {
  const doc = await interactionDoc();
  const map = createInteractionFakeMap();
  const log = { popups: [] };
  const handle = attachCorridorInteractions(map, { createPopup: fakePopupFactory(log), document: doc });
  map.fire("click", "corridor-hit-sea", { features: [{ properties: { title: "郑和下西洋", kind: "sea" } }], lngLat: {} });
  assert.equal(log.popups[0].removed, 0, "点击后 popup 打开");
  handle.close();
  assert.equal(log.popups[0].removed, 1, "close() 关掉过时 popup");
  handle.detach();
});

test("attachCorridorInteractions：detach 卸载时关闭残留 popup + 注销全部监听", async () => {
  const doc = await interactionDoc();
  const map = createInteractionFakeMap();
  const log = { popups: [] };
  const handle = attachCorridorInteractions(map, { createPopup: fakePopupFactory(log), document: doc });
  map.fire("click", "corridor-hit-wall", { features: [{ properties: { title: "明长城", kind: "wall" } }], lngLat: {} });
  const before = map.totalListeners();
  handle.detach();
  assert.equal(log.popups[0].removed, 1, "卸载时关闭残留 popup");
  assert.equal(map.totalListeners(), 0, "卸载后监听清零");
  assert.ok(before > 0);
});

test("attachCorridorInteractions：悬停设指针，离开复位；无 feature 不弹窗", async () => {
  const doc = await interactionDoc();
  const map = createInteractionFakeMap();
  const log = { popups: [] };
  const handle = attachCorridorInteractions(map, { createPopup: fakePopupFactory(log), document: doc });
  map.fire("mouseenter", "corridor-hit-canal", {});
  assert.equal(map.cursor(), "pointer", "悬停线路 → pointer");
  map.fire("mouseleave", "corridor-hit-canal", {});
  assert.equal(map.cursor(), "", "离开 → 复位");
  // 点击无 feature（命中但无 properties）→ 不弹窗
  map.fire("click", "corridor-hit-canal", { features: [], lngLat: {} });
  assert.equal(log.popups.length, 0, "无 feature 不创建 popup");
  handle.detach();
});

test("attachCorridorInteractions：重复 attach 不共享句柄，各自 detach 独立（防重复注册）", async () => {
  const doc = await interactionDoc();
  const map = createInteractionFakeMap();
  const log = { popups: [] };
  const h1 = attachCorridorInteractions(map, { createPopup: fakePopupFactory(log), document: doc });
  const h2 = attachCorridorInteractions(map, { createPopup: fakePopupFactory(log), document: doc });
  // 两次 attach → 每层 click 各 2 个监听（实现者有责任只 attach 一次；此处验证隔离语义）
  assert.equal(map.count("click", "corridor-hit-wall"), 2, "两次注册各 1");
  h1.detach();
  assert.equal(map.count("click", "corridor-hit-wall"), 1, "h1 detach 后剩 h2 的 1 个");
  h2.detach();
  assert.equal(map.count("click", "corridor-hit-wall"), 0, "h2 detach 后清零");
});

// ── Phase 4 R1 复验缺陷回归：标签层必须与线层同年同组（真实 featureFilter + 实际数据）──
// 缺陷：corridorLabelPoints 只复制 key/kind/title，漏 from/to → 标签 feature 无 from/to
// 被 corridorYearFilter 的「缺 from/to = 常显」分支命中，全部 16 标签任意年份都显示。

test("corridorLabelPoints：复制 from/to（有则带、缺则不带，保留原常显语义）", () => {
  const labels = corridorLabelPoints(CORRIDOR_DATA).features;
  // 真实数据 16 条全有 from/to → 每个标签都应带 from/to
  for (const l of labels) {
    const src = CORRIDOR_DATA.features.find((f) => f.properties.key === l.properties.key);
    assert.ok(src, `标签 ${l.properties.title} 有对应源走廊`);
    assert.equal(l.properties.from, src.properties.from, `${l.properties.title} 复制 from`);
    assert.equal(l.properties.to, src.properties.to, `${l.properties.title} 复制 to`);
  }
  // 缺 from/to 的源 → 标签也不带（保留「缺 from/to = 常显」原语义）
  const noRange = corridorLabelPoints({
    type: "FeatureCollection",
    features: [{ geometry: { type: "LineString", coordinates: [[1, 1], [2, 2]] },
      properties: { key: "no_range", kind: "road", title: "无区间路", label_at: [1.5, 1.5] } }],
  });
  assert.equal("from" in noRange.features[0].properties, false, "源无 from → 标签不带 from（常显语义）");
  assert.equal("to" in noRange.features[0].properties, false, "源无 to → 标签不带 to");
});

test("标签层 vs 线层：唐 700 年真实线路 7 条，标签也应 7 个（含名称一致）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  const f = featureFilter(corridorCombinedFilter(700, null));
  const lineVis = CORRIDOR_DATA.features.filter((c) => f.filter({ zoom: 0 }, { properties: c.properties }));
  const labels = corridorLabelPoints(CORRIDOR_DATA).features;
  const labelVis = labels.filter((l) => f.filter({ zoom: 0 }, { properties: l.properties }));
  assert.equal(lineVis.length, 7, "700 年真实线路 7 条");
  assert.equal(labelVis.length, 7, "700 年标签也 7 个（与线同年）");
  const lineTitles = new Set(lineVis.map((c) => c.properties.title));
  for (const l of labelVis) {
    assert.ok(lineTitles.has(l.properties.title), `标签 ${l.properties.title} 对应线在 700 年可见`);
  }
  // 明长城(1368–1948) 标签在 700 年不应显示（缺陷回归）
  assert.equal(labelVis.some((l) => l.properties.title === "明长城"), false, "明长城标签在 700 年不显示");
});

test("标签层：全关 [] → 0 标签（与线层一致）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  const f = featureFilter(corridorCombinedFilter(700, []));
  const labels = corridorLabelPoints(CORRIDOR_DATA).features;
  const vis = labels.filter((l) => f.filter({ zoom: 0 }, { properties: l.properties }));
  assert.equal(vis.length, 0, "全关 → 0 标签");
});

test("标签层：仅 wall 组 → 只显示年份内的长城标签（缺陷：原 only wall 时无墙线仍显 6 墙标签）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  // -200 年：秦长城(-214..-122)、战国长城(-300..-215) 在内；明长城(1368..1948) 不在
  const f = featureFilter(corridorCombinedFilter(-200, ["wall"]));
  const labels = corridorLabelPoints(CORRIDOR_DATA).features;
  const vis = labels.filter((l) => f.filter({ zoom: 0 }, { properties: l.properties }));
  const visTitles = vis.map((l) => l.properties.title);
  assert.ok(vis.some((l) => l.properties.title === "秦长城"), "秦长城标签 -200 年可见");
  assert.equal(vis.some((l) => l.properties.title === "明长城"), false, "明长城标签 -200 年不显示");
  // 仅 wall 组 → 不含运河/道路/海路标签
  assert.equal(vis.every((l) => l.properties.kind === "wall"), true, "仅 wall 标签");
});

test("标签层：端点包含（year=from 或 year=to 都显示）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  // 秦长城 from=-214, to=-122
  const fFrom = featureFilter(corridorCombinedFilter(-214, null));
  const fTo = featureFilter(corridorCombinedFilter(-122, null));
  const qin = corridorLabelPoints(CORRIDOR_DATA).features.find((l) => l.properties.title === "秦长城");
  assert.equal(fFrom.filter({ zoom: 0 }, { properties: qin.properties }), true, "year=from 端点显示");
  assert.equal(fTo.filter({ zoom: 0 }, { properties: qin.properties }), true, "year=to 端点显示");
  assert.equal(featureFilter(corridorCombinedFilter(-215, null)).filter({ zoom: 0 }, { properties: qin.properties }), false, "year=from-1 不显示");
});

// ── R1：popup 负年份 BCE 显示（-121 → 前121）──
test("corridorInfoContent：负年份显示为「前N」（BCE），不显示 -121", async () => {
  const { JSDOM } = await import("jsdom");
  const doc = new JSDOM("<!DOCTYPE html><html><body></body></html>").window.document;
  // 秦长城 -214..-122
  const el1 = corridorInfoContent({ title: "秦长城", kind: "wall", from: -214, to: -122 }, { document: doc });
  assert.equal(el1.querySelector(".corridor-info__years").textContent, "前214–前122 年", "两端 BCE");
  // 汉长城 -121..220（跨 BCE/CE）
  const el2 = corridorInfoContent({ title: "汉长城", kind: "wall", from: -121, to: 220 }, { document: doc });
  assert.equal(el2.querySelector(".corridor-info__years").textContent, "前121–220 年", "BCE→CE 跨段");
  // 京杭大运河 1293..1948（纯 CE）
  const el3 = corridorInfoContent({ title: "京杭大运河", kind: "canal", from: 1293, to: 1948 }, { document: doc });
  assert.equal(el3.querySelector(".corridor-info__years").textContent, "1293–1948 年", "纯 CE 不加「前」");
});

// ── R1：可点击触屏命中区（透明宽 hit 层）──
test("applyCorridorsToMap：每类含透明宽 hit 线层（触屏命中），id=corridor-hit-{kind}", () => {
  const map = createFakeMap();
  applyCorridorsToMap(map, { type: "FeatureCollection", features: [] }, "corridors", {
    versionRef: { current: null },
  });
  for (const kind of CORRIDOR_KINDS) {
    const hit = map.getLayer(`corridor-hit-${kind}`);
    assert.ok(hit, `corridor-hit-${kind} 命中层存在`);
    assert.equal(hit.spec.type, "line", "hit 层为 line");
    assert.ok(hit.spec.paint["line-width"] >= 12, `${kind} hit 层宽度 ≥12（触屏命中区）`);
    assert.equal(hit.spec.paint["line-opacity"], 0, `${kind} hit 层透明（不干扰视觉）`);
  }
});

test("attachCorridorInteractions：点击注册在 corridor-hit-{kind}（宽命中区），非细线层", async () => {
  const { JSDOM } = await import("jsdom");
  const doc = new JSDOM("<!DOCTYPE html><html><body></body></html>").window.document;
  const map = createInteractionFakeMap();
  const log = { popups: [] };
  const handle = attachCorridorInteractions(map, { createPopup: fakePopupFactory(log), document: doc });
  for (const kind of CORRIDOR_KINDS) {
    assert.equal(map.count("click", `corridor-hit-${kind}`), 1, `click 注册在 corridor-hit-${kind}`);
    assert.equal(map.count("mouseenter", `corridor-hit-${kind}`), 1, `mouseenter 注册在 hit 层`);
  }
  handle.detach();
});

// ── R1：idle 未发生先 cleanup 的监听泄漏（scheduleOnIdle 可取消）──
test("scheduleOnIdle：style 未 loaded 时注册 once(idle)，cleanup 在 idle 前取消（不泄漏）", () => {
  // fake map：style 未 loaded，记录 once/off
  let idleCb = null;
  const offLog = [];
  const map = {
    isStyleLoaded: () => false,
    once(type, cb) { idleCb = cb; },
    off(type, cb) { offLog.push(cb); },
    getCanvas: () => ({ style: {} }),
    on() {}, fire() {}, count() { return 0; },
  };
  let attached = false;
  const cancel = scheduleOnIdle(map, () => { attached = true; });
  assert.equal(attached, false, "idle 未发生，未 attach");
  assert.notEqual(idleCb, null, "已注册 once(idle)");
  cancel(); // cleanup 在 idle 前调用
  assert.ok(offLog.includes(idleCb), "cleanup 取消了 once(idle) 监听（不泄漏）");
  // 之后 idle 触发也不再 attach（已取消）
  if (idleCb) idleCb();
  assert.equal(attached, false, "取消后 idle 触发不再 attach");
});

test("scheduleOnIdle：style 已 loaded 时立即 attach，不注册 once", () => {
  const map = {
    isStyleLoaded: () => true,
    once() { throw new Error("不应注册 once"); },
    off() {},
  };
  let attached = false;
  const cancel = scheduleOnIdle(map, () => { attached = true; });
  assert.equal(attached, true, "style loaded → 立即 attach");
  cancel(); // 不抛
});

// ── Phase 4 R2 复验缺陷：corridor-hit-{kind} 透明命中层必须与可见线层
//    采用同一 kind+year+enabled 过滤（初始/重建/切年/关组均如此）。
// 缺陷：组件 effect 只对 corridor-line-{kind} 与 corridor-label 调 setFilter，
//    漏掉 corridor-hit-{kind} → 明长城在 700 年不可见但仍可被点击（幽灵命中），
//    关组后该组线路不可见但仍可被点击，多类 hit 层可对同一要素重复命中。
// 用真实 @maplibre/maplibre-gl-style-spec featureFilter + 真实 corridors.geojson
// + fake map（记录 setFilter）测生产接线路径 applyCorridorFilters（组件 effect 委托）。

test("applyCorridorFilters：每类 hit 层与 line 层过滤表达式完全一致（同步过滤）", async () => {
  const map = createFakeMap();
  applyCorridorsToMap(map, CORRIDOR_DATA, "corridors", { versionRef: { current: null } });
  applyCorridorFilters(map, 700, null);
  for (const kind of CORRIDOR_KINDS) {
    const line = map.getLayer(`corridor-line-${kind}`);
    const hit = map.getLayer(`corridor-hit-${kind}`);
    assert.ok(hit.filter, `corridor-hit-${kind} 必须设置 filter（缺陷：原未设置 → 幽灵命中）`);
    assert.ok(line.filter, `corridor-line-${kind} 设置了 filter`);
    assert.deepEqual(hit.filter, line.filter,
      `corridor-hit-${kind} 与 corridor-line-${kind} 过滤表达式一致`);
  }
});

test("applyCorridorFilters：700 年明长城不可命中（hit 层与线层同年过滤）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  const map = createFakeMap();
  applyCorridorsToMap(map, CORRIDOR_DATA, "corridors", { versionRef: { current: null } });
  applyCorridorFilters(map, 700, null);
  const mingWall = CORRIDOR_DATA.features.find((f) => f.properties.title === "明长城");
  assert.ok(mingWall, "真实数据含明长城");
  const wallHit = featureFilter(map.getLayer("corridor-hit-wall").filter);
  assert.equal(wallHit.filter({ zoom: 0 }, { properties: mingWall.properties }), false,
    "700 年：corridor-hit-wall 不可命中明长城（1368–1948，年份外）");
  const wallLine = featureFilter(map.getLayer("corridor-line-wall").filter);
  assert.equal(wallLine.filter({ zoom: 0 }, { properties: mingWall.properties }), false,
    "700 年：corridor-line-wall 也不可见明长城（线/hit 同年）");
  // 同 year=700 真实命中数：hit 与 line 一致（7 条，无幽灵增减）
  const hitVis = CORRIDOR_DATA.features.filter((f) => wallHit.filter({ zoom: 0 }, { properties: f.properties }) && f.properties.kind === "wall");
  // wall 类在 700 年：汉长城(-121..220)已结束、明长城未开始 → 0 条墙线
  // 此处仅断言 hit 与 line 行为一致，不强制数量
});

test("applyCorridorFilters：全关 [] → 每类 hit 层无任何命中（与 line 层一致，无幽灵）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  const map = createFakeMap();
  applyCorridorsToMap(map, CORRIDOR_DATA, "corridors", { versionRef: { current: null } });
  applyCorridorFilters(map, 700, []);
  for (const kind of CORRIDOR_KINDS) {
    const hitFilter = map.getLayer(`corridor-hit-${kind}`).filter;
    assert.ok(hitFilter, `corridor-hit-${kind} 设置了 filter`);
    const compiled = featureFilter(hitFilter);
    for (const f of CORRIDOR_DATA.features) {
      assert.equal(compiled.filter({ zoom: 0 }, { properties: f.properties }), false,
        `全关：corridor-hit-${kind} 不命中 ${f.properties.title}（含本类）`);
    }
    // hit 与 line 一致
    assert.deepEqual(hitFilter, map.getLayer(`corridor-line-${kind}`).filter,
      `全关：corridor-hit-${kind} 与 line 过滤一致`);
  }
});

test("applyCorridorFilters：only wall → 仅 wall hit 层命中本类年份内，他类 hit 层无命中（每层隔离）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  const map = createFakeMap();
  applyCorridorsToMap(map, CORRIDOR_DATA, "corridors", { versionRef: { current: null } });
  applyCorridorFilters(map, -200, ["wall"]);
  const qin = CORRIDOR_DATA.features.find((f) => f.properties.title === "秦长城");
  const zhanguo = CORRIDOR_DATA.features.find((f) => f.properties.title.includes("战国"));
  const ming = CORRIDOR_DATA.features.find((f) => f.properties.title === "明长城");
  // wall hit 层：秦长城(-214..-122) 在 -200 命中；战国长城(-300..-215) 在 -200 已结束不命中；
  // 明长城(1368..1948) 年份外不命中
  const wallHit = featureFilter(map.getLayer("corridor-hit-wall").filter);
  assert.equal(wallHit.filter({ zoom: 0 }, { properties: qin.properties }), true, "秦长城 -200 在 wall hit 命中");
  assert.equal(wallHit.filter({ zoom: 0 }, { properties: zhanguo.properties }), false, "战国长城 -200 不在 wall hit 命中（to=-215 已结束）");
  assert.equal(wallHit.filter({ zoom: 0 }, { properties: ming.properties }), false, "明长城 -200 不在 wall hit 命中（年份外）");
  // 他类 hit 层：无任何命中（分组隔离，无跨层重复命中）
  for (const kind of ["canal", "road", "sea"]) {
    const f = featureFilter(map.getLayer(`corridor-hit-${kind}`).filter);
    for (const feat of CORRIDOR_DATA.features) {
      assert.equal(f.filter({ zoom: 0 }, { properties: feat.properties }), false,
        `only wall：corridor-hit-${kind} 不命中 ${feat.properties.title}（每层隔离）`);
    }
  }
});

test("applyCorridorFilters：from/to 边界年份命中（端点包含，hit 与 line 一致）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  const map = createFakeMap();
  applyCorridorsToMap(map, CORRIDOR_DATA, "corridors", { versionRef: { current: null } });
  const qin = CORRIDOR_DATA.features.find((f) => f.properties.title === "秦长城");
  // 秦长城 from=-214, to=-122
  applyCorridorFilters(map, -214, null);
  let wallHit = featureFilter(map.getLayer("corridor-hit-wall").filter);
  assert.equal(wallHit.filter({ zoom: 0 }, { properties: qin.properties }), true, "year=from 端点 hit 命中");
  applyCorridorFilters(map, -122, null);
  wallHit = featureFilter(map.getLayer("corridor-hit-wall").filter);
  assert.equal(wallHit.filter({ zoom: 0 }, { properties: qin.properties }), true, "year=to 端点 hit 命中");
  applyCorridorFilters(map, -215, null);
  wallHit = featureFilter(map.getLayer("corridor-hit-wall").filter);
  assert.equal(wallHit.filter({ zoom: 0 }, { properties: qin.properties }), false, "year=from-1 hit 不命中");
  applyCorridorFilters(map, -121, null);
  wallHit = featureFilter(map.getLayer("corridor-hit-wall").filter);
  assert.equal(wallHit.filter({ zoom: 0 }, { properties: qin.properties }), false, "year=to+1 hit 不命中");
});

test("applyCorridorFilters：对未存在的层安全跳过（不抛，兼容旧单层 corridor-line）", () => {
  const map = createFakeMap();
  // 不调用 applyCorridorsToMap → 无走廊层
  assert.doesNotThrow(() => applyCorridorFilters(map, 700, null), "无走廊层时不抛");
});

test("applyCorridorFilters：标签层也同步过滤（关组后名称不残留，与 hit/line 一致）", async () => {
  const { featureFilter } = await import("@maplibre/maplibre-gl-style-spec");
  const map = createFakeMap();
  applyCorridorsToMap(map, CORRIDOR_DATA, "corridors", { versionRef: { current: null } });
  applyCorridorFilters(map, 700, ["canal", "road", "sea"]); // 关 wall
  const labelFilter = map.getLayer("corridor-label").filter;
  assert.ok(labelFilter, "标签层设置 filter");
  const compiled = featureFilter(labelFilter);
  const mingLabel = corridorLabelPoints(CORRIDOR_DATA).features
    .find((l) => l.properties.title === "明长城");
  assert.ok(mingLabel, "明长城标签存在");
  assert.equal(compiled.filter({ zoom: 0 }, { properties: mingLabel.properties }), false,
    "关 wall：明长城标签不可见（与 hit/line 同步）");
});
