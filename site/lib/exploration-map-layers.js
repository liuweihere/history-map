// 探索地图图层变更的纯函数（从 ExplorationMapStage 抽出，便于用 fake map 测试）。
//
// 解决的缺陷：
// 1. map 异步 init：snapshot effect 在 mapRef null 时 return；若 snapshot fetch
//    比 init 快，map ready 后不会重触 snapshot effect → 地图无疆域。
//    → 组件层用 mapReady state 纳入 effect deps；这里提供幂等 apply，可安全重入。
// 2. snapshot=null 时旧 effect 直接 return，旧 polity 不清除，转场显示旧数据。
//    → clearPolityLayers 独立可调用；组件在 mapReady && !snapshot 时调用清空。
// 3. polity addLayer 无 beforeId，可能盖住走廊路线。→ applyPolityToMap 在
//    corridor-line 已存在时 insert before 它，保证走廊在上层。
// 4. version 不可用 JSON.stringify(...).length 推断（两个不同快照长度相等会错误
//    跳过重建）。→ 改用显式 phaseKey 字符串身份（dynasty.key+snapshot+from+to），
//    由父组件传入；同 phaseKey 且源已存在才跳过，否则清空重建。

import { polityAnchor } from "./jiangshan-data";

/**
 * 清除政权快照层（layer / source / 标签）。
 * 用于 snapshot=null 转场（§5 stale 不呈现）与 apply 前的重建。
 */
export function clearPolityLayers(map, labelsRef) {
  if (!map) return;
  if (map.getLayer && map.getLayer("polity-fill")) map.removeLayer("polity-fill");
  if (map.getSource && map.getSource("jiangshan-polity")) map.removeSource("jiangshan-polity");
  if (labelsRef) {
    const labels = labelsRef.current ?? [];
    labels.forEach((m) => m && typeof m.remove === "function" && m.remove());
    labelsRef.current = [];
  }
}

/**
 * 应用政权快照到 map（幂等：同 phaseKey 且源已存在则跳过重建）。
 * 在 corridor-line 层已存在时 insert before 它，保证走廊路线在上层。
 * @param {object} map  map-like
 * @param {object} snapshot  政权快照 FeatureCollection
 * @param {string} phaseKey  显式阶段身份（不可用字节长度推断）
 * @returns {boolean} true 表示实际重建；false 表示跳过。
 */
export function applyPolityToMap(map, snapshot, phaseKey, { versionRef, labelsRef, createMarker }) {
  if (!map || !snapshot || !phaseKey) return false;
  // 同 phaseKey 且源已存在 → 跳过重建（不依赖内容长度）
  if (versionRef.current === phaseKey && map.getSource && map.getSource("jiangshan-polity")) {
    return false;
  }
  versionRef.current = phaseKey;

  // 先清旧（含标签），再重建——保证转场无残留
  clearPolityLayers(map, labelsRef);

  map.addSource("jiangshan-polity", { type: "geojson", data: snapshot });
  // 明确图层顺序：corridor-line 已存在则 insert before，走廊保持在上层（§2/§4）
  const beforeId = map.getLayer && map.getLayer("corridor-line") ? "corridor-line" : undefined;
  map.addLayer(
    {
      id: "polity-fill",
      type: "fill",
      source: "jiangshan-polity",
      paint: {
        "fill-color": ["coalesce", ["get", "display_color"], ["get", "tint"], "#D9C7A8"],
        "fill-opacity": 0.32,
        "fill-outline-color": "rgba(60,40,20,0.18)",
      },
    },
    beforeId,
  );

  if (createMarker && labelsRef) {
    labelsRef.current = (snapshot.features ?? [])
      .map((f) => {
        const props = f.properties ?? {};
        const anchor = polityAnchor(props);
        if (!anchor || !props.title) return null;
        try {
          return createMarker(props, anchor);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  return true;
}

/**
 * 清除走廊层。
 */
export function clearCorridorLayers(map) {
  if (!map) return;
  if (map.getLayer && map.getLayer("corridor-line")) map.removeLayer("corridor-line");
  if (map.getSource && map.getSource("jiangshan-corridors")) map.removeSource("jiangshan-corridors");
}

/**
 * 应用走廊源 + 线层（幂等：同 corridorsKey 且源已存在则跳过）。
 * 走廊作为上层线层：addLayer 追加到顶（不 insert before polity），确保路线在
 * 政权填色之上；polity 则 insert before corridor-line，两者先后添加都维持走廊在上。
 */
export function applyCorridorsToMap(map, corridors, corridorsKey, { versionRef }) {
  if (!map || !corridors || !corridorsKey) return false;
  if (versionRef.current === corridorsKey && map.getSource && map.getSource("jiangshan-corridors")) {
    return false;
  }
  versionRef.current = corridorsKey;
  clearCorridorLayers(map);
  map.addSource("jiangshan-corridors", { type: "geojson", data: corridors });
  map.addLayer({
    id: "corridor-line",
    type: "line",
    source: "jiangshan-corridors",
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#8B5A2B"],
      "line-width": 2,
      "line-opacity": 0.7,
      "line-dasharray": [2, 2],
    },
  });
  return true;
}

/**
 * 走廊年份过滤表达式：from<=year<=to 两端包含；from/to 缺失（无 span）→ 一直显示。
 * 与 corridorActiveAt 语义一致。
 */
export function corridorYearFilter(selectedYear) {
  return [
    "any",
    ["!", ["all", ["has", "from"], ["has", "to"]]],
    ["all", ["<=", ["get", "from"], selectedYear], [">=", ["get", "to"], selectedYear]],
  ];
}
