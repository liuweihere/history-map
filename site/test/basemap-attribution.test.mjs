// Phase 0 RED→GREEN test: Carto basemap attribution 正确显示。
//
// 验收项（PLAN.md V3 §5 / §7，独立验收 #9）：
// - attributionControl:false 使底图署名悬空；需恢复 attribution 或自绘 credit。
// - 纯色 fallback 下也不伪报 Carto basemap（在线时才显示 Carto 署名）。
// - 许可评估保留人工关卡（不自动判定合规）。
//
// 本测试在数据/逻辑层断言：attribution 信息是否随 basemap 在线状态正确分流，
// 不依赖浏览器渲染（headless MapLibre painter 失败需环境对照，不改地图实现）。

import { test } from "node:test";
import assert from "node:assert/strict";

// 从 history-map-stage.jsx 抽取的纯逻辑（不依赖 maplibre-gl）：
// basemap 在线时 attribution 应含 Carto；离线 fallback 时不得伪报 Carto。
// 这里直接 import 模块中导出的 attribution 构建函数（若无则 RED）。

import { buildBasemapAttribution } from "../lib/basemap-attribution.js";

test("在线 Carto basemap 的 attribution 包含 CartoDB/Carto 署名", () => {
  const attr = buildBasemapAttribution(true);
  assert.ok(attr && attr.length > 0, "在线 attribution 不应为空");
  assert.ok(/carto/i.test(attr), `在线 attribution 应含 Carto，实际: "${attr}"`);
});

test("离线纯色 fallback 的 attribution 不得伪报 Carto", () => {
  const attr = buildBasemapAttribution(false);
  assert.ok(attr && attr.length > 0, "离线 attribution 不应为空（需自绘 credit）");
  assert.ok(!/carto/i.test(attr), `离线 fallback 不得伪报 Carto，实际: "${attr}"`);
  // 应诚实标注为本地回退底图
  assert.ok(/回退|fallback|本地/i.test(attr), `离线应标注回退底图，实际: "${attr}"`);
});

test("attribution 始终非空（在线与离线都不悬空）", () => {
  assert.ok(buildBasemapAttribution(true).length > 0);
  assert.ok(buildBasemapAttribution(false).length > 0);
});
