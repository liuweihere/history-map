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

import { polityAnchor } from "./jiangshan-data.js";

/**
 * 清除政权快照层（layer / source / 标签）。
 * 用于 snapshot=null 转场（§5 stale 不呈现）与 apply 前的重建。
 */
export function clearPolityLayers(map, labelsRef) {
  if (!map) return;
  if (map.getLayer && map.getLayer("polity-fill")) map.removeLayer("polity-fill");
  if (map.getLayer && map.getLayer("polity-outline")) map.removeLayer("polity-outline");
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
  // 明确图层顺序：四类走廊线层最底层为 corridor-line-wall，polity insert before 它，
  // 保证四类走廊路线都在政权填色之上（§2/§4）；兼容旧单层 corridor-line。
  const beforeId = map.getLayer && (map.getLayer("corridor-line-wall") || map.getLayer("corridor-line"))
    ? (map.getLayer("corridor-line-wall") ? "corridor-line-wall" : "corridor-line")
    : undefined;
  map.addLayer(
    {
      id: "polity-fill",
      type: "fill",
      source: "jiangshan-polity",
      paint: {
        "fill-color": ["coalesce", ["get", "display_color"], ["get", "tint"], "#D9C7A8"],
        // 浏览器实测：pastel display_color × 0.32 叠在 0.22 大区水彩上疆域几乎不可见；
        // 0.5 + 可辨描边才能让「疆域」成为可读信息（儿童产品核心）。
        "fill-opacity": 0.5,
        "fill-outline-color": "rgba(60,40,20,0.35)",
      },
    },
    beforeId,
  );

  // 疆界描边独立 line 层：fill-outline-color 不支持数据驱动，
  // 而界线要用每政权饱和 tint（魏#4a6fa5/蜀汉#c98a2b/吴#3f8f6a）才可辨——
  // pastel 填充读「面」、饱和描边读「界」。
  map.addLayer(
    {
      id: "polity-outline",
      type: "line",
      source: "jiangshan-polity",
      paint: {
        "line-color": ["coalesce", ["get", "tint"], ["get", "display_color"], "#8a7a66"],
        "line-width": 1.6,
        "line-opacity": 0.6,
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
 * 清除走廊层（四类线层 + 标签层 + 两源）。
 * 四类线层 id 形如 corridor-line-{kind}；旧单层 corridor-line 也兼容清除（防残留）。
 */
export function clearCorridorLayers(map) {
  if (!map) return;
  const removeLayer = (id) => { if (map.getLayer && map.getLayer(id)) map.removeLayer(id); };
  for (const kind of CORRIDOR_KINDS) removeLayer(`corridor-line-${kind}`);
  removeLayer("corridor-line"); // 兼容旧单层残留
  removeLayer("corridor-label");
  if (map.getSource && map.getSource("jiangshan-corridors")) map.removeSource("jiangshan-corridors");
  if (map.getSource && map.getSource("jiangshan-corridor-labels")) map.removeSource("jiangshan-corridor-labels");
}

/**
 * 走廊分组配色（上游 jiangshan-map css/style.css .corridor-line.* 对照移植）：
 * wall #5a3826 深褐 / canal #1f6f8b 靛青 / road(丝路) #9c6317 琥珀 / sea #2c5d8f 藏蓝。
 */
export const CORRIDOR_KIND_COLORS = {
  wall: "#5a3826",
  canal: "#1f6f8b",
  road: "#9c6317",
  sea: "#2c5d8f",
};

/**
 * 四类线样（上游 jiangshan-map css/style.css .corridor-line.{kind} 对照移植）。
 * MapLibre line-dasharray 不支持数据驱动，粗/长/短/稀四样虚线必须靠四个
 * 独立 line 层实现——dasharray 取整数（MapLibre 通用接受），由上游 CSS
 * dasharray 近似取整并保持四类两两不同：
 * - wall  粗虚线：宽 2.4、[5,2]（上游 5 2.5 / width 2.4）
 * - canal 长虚线：宽 2.2、[7,3]（上游 7 3 / width 2.2）
 * - road  短虚线：宽 1.7、[2,3]（上游 2.5 3.5 / width 1.7）
 * - sea   稀虚线：宽 1.7、[2,4]（上游 2 4 / width 1.7）
 */
export const CORRIDOR_KIND_STYLES = {
  wall: { width: 2.4, dasharray: [5, 2] },
  canal: { width: 2.2, dasharray: [7, 3] },
  road: { width: 1.7, dasharray: [2, 3] },
  sea: { width: 1.7, dasharray: [2, 4] },
};

/** 四类中文展示名（图例标签与点击识别共用；不伪造，仅映射 kind→标签）。 */
export const CORRIDOR_KIND_LABELS = {
  wall: "长城",
  canal: "运河",
  road: "道路",
  sea: "海路",
};

/**
 * 从走廊数据提取 label_at 名称标签点（上游 corridor-caption 对照：
 * label_at 锚点 + 标题文字；无 label_at 的走廊不生成标签）。
 */
export function corridorLabelPoints(corridors) {
  const features = [];
  for (const f of corridors?.features ?? []) {
    const p = f?.properties ?? {};
    if (!Array.isArray(p.label_at) || p.label_at.length < 2 || !p.title) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.label_at[0], p.label_at[1]] },
      properties: { key: p.key ?? null, kind: p.kind ?? null, title: p.title },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * 应用走廊源 + 四类线层 + 名称标签层（幂等：同 corridorsKey 且源已存在则跳过）。
 * 走廊作为上层线层：addLayer 追加到顶（不 insert before polity），确保路线在
 * 政权填色之上；polity 则 insert before corridor-line-wall（四类最底层），两者
 * 先后添加都维持走廊在上。
 * P4 可读性（上游对照 .corridor-line/.corridor-caption）：
 * - kind 分色 + 四样虚线：MapLibre line-dasharray 不支持数据驱动，粗/长/短/稀
 *   四样靠四个独立 line 层（corridor-line-{kind}）实现，各取 CORRIDOR_KIND_STYLES；
 * - label_at 生成 symbol 名称标签，描边保证可读。
 */
export function applyCorridorsToMap(map, corridors, corridorsKey, { versionRef }) {
  if (!map || !corridors || !corridorsKey) return false;
  if (versionRef.current === corridorsKey && map.getSource && map.getSource("jiangshan-corridors")) {
    return false;
  }
  versionRef.current = corridorsKey;
  clearCorridorLayers(map);
  map.addSource("jiangshan-corridors", { type: "geojson", data: corridors });
  // 四类各自独立 line 层：solid 分色 + 各自 dasharray/width（上游 .corridor-line.{kind}）
  for (const kind of CORRIDOR_KINDS) {
    const style = CORRIDOR_KIND_STYLES[kind];
    map.addLayer({
      id: `corridor-line-${kind}`,
      type: "line",
      source: "jiangshan-corridors",
      paint: {
        "line-color": CORRIDOR_KIND_COLORS[kind],
        "line-width": style.width,
        "line-opacity": 0.85,
        "line-dasharray": style.dasharray,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  }
  // 名称标签层（上游 corridor-caption：衬线小字 + 浅色描边）
  map.addSource("jiangshan-corridor-labels", { type: "geojson", data: corridorLabelPoints(corridors) });
  map.addLayer({
    id: "corridor-label",
    type: "symbol",
    source: "jiangshan-corridor-labels",
    layout: {
      "text-field": ["get", "title"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-anchor": "center",
    },
    paint: {
      "text-color": "#4a341c",
      "text-halo-color": "rgba(248, 243, 232, 0.92)",
      "text-halo-width": 1.6,
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

// ── Phase 4：走廊分组开关（PLAN.md「关河丝路按 from/to 过滤 + 分组开关」）──

/** 走廊分组的固定顺序（= corridors.geojson 的 kind 全集，UI 与过滤共用）。 */
export const CORRIDOR_KINDS = ["wall", "canal", "road", "sea"];

/**
 * 分组开关过滤表达式：kind ∈ enabledKinds。
 * 空列表 → ["in", ["get","kind"], ["literal", []]]（空列表恒 false，全关）。
 * 注意：expression 语法 "in" 仅接受 2 参数（needle/haystack），多值必须包
 * ["literal", [...]]——展开为多参数是 legacy filter 语法，真实 maplibre
 * setFilter 会抛 "Expected 2 arguments"（2026-11-12 featureFilter 实测）。
 */
export function corridorGroupFilter(enabledKinds) {
  return ["in", ["get", "kind"], ["literal", [...(enabledKinds ?? [])]]];
}

/**
 * 年份 + 分组联合过滤（P4 交付：明长城不出现在唐代 AND 关组不显示）。
 * null/undefined = 未控制 = 全开（退化为纯年份过滤）；
 * 空数组 = 显式全关（空 in 列表，真实 featureFilter 下恒 false）。
 * 2026-11-12 浏览器实测回归：此前 (enabledKinds ?? []) 把 null 错当空列表，
 * 导致非受控初始态下全部走廊被过滤掉。
 */
export function corridorCombinedFilter(selectedYear, enabledKinds) {
  if (enabledKinds == null) return corridorYearFilter(selectedYear);
  if (enabledKinds.length >= CORRIDOR_KINDS.length) return corridorYearFilter(selectedYear);
  return ["all", corridorYearFilter(selectedYear), corridorGroupFilter(enabledKinds)];
}

/**
 * 单类线层过滤：本类 AND（年份 + 分组联合）。
 * 四类线层各自调用，使「哪条线是干啥的」由层身份决定，分组开关经
 * corridorCombinedFilter 的 enabledKinds 控制（关某组 → 该组层无命中）。
 * null enabledKinds = 全开（仅本类 + 年份）；[] = 全关（空 in 列表恒 false）。
 */
export function corridorLayerFilter(kind, selectedYear, enabledKinds) {
  return ["all", ["==", ["get", "kind"], kind], corridorCombinedFilter(selectedYear, enabledKinds)];
}

/**
 * 走廊点击识别内容（纯 DOM，textContent 安全，不伪造）。
 * 仅使用已入库字段：title / kind / from / to / summary；summary 缺失则不渲染，
 * 绝不编造。返回一个可挂到 MapLibre Popup.setDOMContent 的 Element。
 * @param {object} props  走廊 feature.properties
 * @param {object} [opts]
 * @param {object} [opts.document]  注入 document（测试用 jsdom；默认全局）
 */
export function corridorInfoContent(props, opts) {
  const p = props ?? {};
  const doc = (opts && opts.document) || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  const wrap = doc.createElement("div");
  wrap.className = "corridor-info";
  const name = doc.createElement("strong");
  name.className = "corridor-info__name";
  name.textContent = p.title || "";
  wrap.appendChild(name);
  // 分组标签（kind→中文，仅映射，不伪造）
  const kindLabel = CORRIDOR_KIND_LABELS[p.kind] ?? p.kind ?? null;
  if (kindLabel) {
    const k = doc.createElement("span");
    k.className = "corridor-info__kind";
    k.textContent = kindLabel;
    wrap.appendChild(k);
  }
  // 起止年份（仅当数据有 from/to）
  if (p.from != null && p.to != null) {
    const span = doc.createElement("span");
    span.className = "corridor-info__years";
    span.textContent = `${p.from}–${p.to} 年`;
    wrap.appendChild(span);
  }
  // 摘要：仅当数据已入库（10/16 条有 summary），缺失不渲染、不编造
  if (p.summary) {
    const s = doc.createElement("p");
    s.className = "corridor-info__summary";
    s.textContent = p.summary;
    wrap.appendChild(s);
  }
  return wrap;
}

/**
 * 走廊点击/悬停接线（单一可测试事件绑定 helper，由组件真实调用）。
 * 无需真实 WebGL：map 仅需 on/off（2 参 map-level 与 3 参 layer-scoped）、
 * getCanvas；createPopup 注入返回 { setDOMContent, setLngLat, addTo, remove }。
 *
 * 行为：
 * - 点击 corridor-line-{kind}：经 corridorInfoContent（textContent，仅入库字段）
 *   构建 DOM，Popup.setDOMContent 挂载，setLngLat(点击坐标)，addTo(map)；
 * - 再次点击他线路：先 close 旧 popup 再开新（触屏切线路不叠加）；
 * - 悬停设指针 pointer、离开复位（无障碍/可点击暗示）；
 * - 返回 { close, detach }：close 关掉过时 popup（切年/关组时由组件调用，
 *   不影响他人已有过滤逻辑）；detach 注销全部监听并关残留 popup（卸载清理）。
 * 重复 attach 各句柄独立（组件有责任只 attach 一次，attach 在 corridors/mapReady
 * 变化时；year/kind 变化只调 close 不重 attach，避免注册泄漏）。
 */
export function attachCorridorInteractions(map, opts = {}) {
  if (!map) return { close() {}, detach() {} };
  const createPopup = opts.createPopup;
  const doc = (opts && opts.document) || (typeof document !== "undefined" ? document : null);
  let currentPopup = null;
  const regs = []; // [type, layerId, fn]

  const close = () => {
    if (currentPopup) {
      try { currentPopup.remove(); } catch { /* map 已销毁等，静默 */ }
      currentPopup = null;
    }
  };
  const setCursor = (c) => {
    try {
      const cv = map.getCanvas && map.getCanvas();
      if (cv && cv.style) cv.style.cursor = c;
    } catch { /* 忽略 */ }
  };

  for (const kind of CORRIDOR_KINDS) {
    const id = `corridor-line-${kind}`;
    const onClick = (e) => {
      close(); // 切线路/重点击：先关旧 popup，避免叠加与过时残留
      const f = e && e.features && e.features[0];
      if (!f || !createPopup) return;
      const content = corridorInfoContent(f.properties || {}, { document: doc });
      if (!content) return;
      const popup = createPopup();
      popup.setDOMContent(content);
      if (e && e.lngLat != null) {
        try { popup.setLngLat(e.lngLat); } catch { /* 忽略 */ }
      }
      popup.addTo(map);
      currentPopup = popup;
    };
    const onEnter = () => setCursor("pointer");
    const onLeave = () => setCursor("");
    map.on("click", id, onClick);
    map.on("mouseenter", id, onEnter);
    map.on("mouseleave", id, onLeave);
    regs.push(["click", id, onClick], ["mouseenter", id, onEnter], ["mouseleave", id, onLeave]);
  }

  return {
    close,
    detach() {
      for (const [type, id, fn] of regs) {
        try { map.off(type, id, fn); } catch { /* 忽略 */ }
      }
      regs.length = 0;
      close();
    },
  };
}
