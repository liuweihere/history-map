"use client";

import React, { useEffect, useRef, useState } from "react";

import { REGION_GEOJSON_PATH } from "../lib/history-regions";
import { buildBasemapAttribution } from "../lib/basemap-attribution";
import {
  clearPolityLayers,
  applyPolityToMap,
  applyCorridorsToMap,
  corridorYearFilter,
} from "../lib/exploration-map-layers";

// ── 现成矢量底图（与 history-map-stage 一致：CartoDB Positron）─────────
const BASEMAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const FALLBACK_BASEMAP_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: "parchment-base", type: "background", paint: { "background-color": "#EFE9DC" } },
  ],
};

async function loadBasemapStyle() {
  try {
    const response = await fetch(BASEMAP_STYLE_URL);
    if (!response.ok) throw new Error(`basemap style HTTP ${response.status}`);
    const style = await response.json();
    return { style, online: true };
  } catch (error) {
    console.warn("[exploration-map] basemap unavailable, fallback:", error);
    return { style: FALLBACK_BASEMAP_STYLE, online: false };
  }
}

function createPolityLabelNode(props) {
  const wrapper = document.createElement("div");
  wrapper.className = "polity-label";
  const name = document.createElement("span");
  name.className = "polity-label__name";
  name.textContent = props.title ?? "";
  wrapper.append(name);
  return wrapper;
}

/**
 * 探索状态地图舞台。
 *
 * 图层顺序（§2/§4 护栏，明确图层顺序而非依赖异步完成顺序）：
 *   CartoDB 底图 → 8 大区水彩（探索时淡化，不堆色块）
 *   → 政权快照填色（淡化，display_color 优先回退 tint/安全色）
 *   → 走廊路线（上层）→ 政权锚点标签。
 * 水系未导入（由底图自动提供）；提示「示意／近似」「现代底图参考」。
 *
 * @param {object} snapshot  当前 phase 政权快照 FeatureCollection（已加载）
 * @param {string|null} phaseKey  显式阶段身份（dynasty.key+snapshot+from+to），
 *   用于幂等重建判定（不用字节长度推断）；跨 phase 变化即重建。
 * @param {object|null} corridors  corridors.geojson（常驻）
 * @param {number} selectedYear  当前所选年份（用于走廊过滤）
 * @param {object|null} initialCamera  恢复的视角 {center:[lng,lat], zoom}
 * @param {function|null} onCameraChange  视角变化上报（往返恢复用）
 */
export function ExplorationMapStage({ snapshot, phaseKey, corridors, selectedYear, initialCamera, onCameraChange }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const maplibreglRef = useRef(null); // init 中保存模块，供 effect createMarker 使用
  const polityLabelsRef = useRef([]);
  // mapReady：map "load" 后置 true，纳入 snapshot/corridors effect deps，
  // 解决 map 异步 init 与 snapshot fetch 竞态——map ready 后重触 effect 应用待挂快照。
  const [mapReady, setMapReady] = useState(false);
  const [basemapOnline, setBasemapOnline] = useState(null);
  const [error, setError] = useState(null);
  const cameraCbRef = useRef(onCameraChange);
  cameraCbRef.current = onCameraChange;

  // ── 初始化底图 + 大区（常驻，淡化）──────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!mapNodeRef.current || mapRef.current) return;
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;
      maplibreglRef.current = maplibregl;

      const { style: basemapStyle, online: online } = await loadBasemapStyle();
      if (cancelled) return;
      mapNodeRef.current.classList.toggle("map--basemap-off", !online);
      setBasemapOnline(online);

      const map = new maplibregl.Map({
        container: mapNodeRef.current,
        style: basemapStyle,
        localIdeographFontFamily:
          "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif",
        center: initialCamera?.center ?? [108.5, 35.5],
        zoom: initialCamera?.zoom ?? 3.4,
        minZoom: 2.8,
        maxZoom: 7.2,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      mapRef.current = map;

      // 视角变化上报（往返恢复：进入故事前捕获，返回时恢复）
      const reportCamera = () => {
        if (!mapRef.current) return;
        const center = mapRef.current.getCenter();
        cameraCbRef.current?.({
          center: [center.lng, center.lat],
          zoom: mapRef.current.getZoom(),
        });
      };
      map.on("moveend", reportCamera);
      map.on("zoomend", reportCamera);

      map.on("style.load", () => {
        if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#A2C9E6");
        if (map.getLayer("water_shadow")) map.setPaintProperty("water_shadow", "fill-color", "#B4D2E9");
        if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#F6F3EB");
        if (map.getLayer("waterway")) map.setPaintProperty("waterway", "line-color", "#77A3C7");
        for (const layer of map.getStyle().layers) {
          if (layer.type !== "symbol") continue;
          if (!layer.layout?.["text-field"]) continue;
          map.setLayoutProperty(layer.id, "text-field", [
            "coalesce",
            ["get", "name:zh"],
            ["get", "name:zh-Hans"],
            ["get", "name:latin"],
            ["get", "name"],
          ]);
        }
      });

      map.on("load", () => {
        if (cancelled) return;
        // 8 大区水彩底座（探索时淡化：0.45 → 0.22，不堆色块）
        fetch(REGION_GEOJSON_PATH)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
          .then((regions) => {
            if (cancelled || !mapRef.current || !regions) return;
            map.addSource("history-regions", { type: "geojson", data: regions });
            map.addLayer({
              id: "regions-fill",
              type: "fill",
              source: "history-regions",
              paint: {
                "fill-color": ["get", "color"],
                "fill-opacity": 0.22,
              },
            });
          });
        // 标记 map ready：触发 snapshot/corridors effect 重跑，应用待挂数据
        // （解决 fetch 比 init 快、mapRef null 时 effect 早退的竞态）
        setMapReady(true);
      });
    }

    init().catch((e) => {
      if (cancelled) return; // 卸载后不再 setState（避免 React 19 调度器异步泄漏）
      console.error("[exploration-map] init failed", e);
      setError(String(e?.message ?? e));
    });

    return () => {
      cancelled = true;
      polityLabelsRef.current.forEach((m) => m.remove());
      polityLabelsRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ── 政权快照：随 snapshot / phaseKey / mapReady 更新 ───────────────
  // 竞态修复：mapReady 纳入 deps——map 异步 init 完成后重触本 effect，
  // 应用在 map 未就绪期间到达的快照（否则地图无疆域）。
  // 转场修复：snapshot=null（跨 phase 清空）时清除旧 polity 层/标签，不残留旧数据。
  // 幂等：同 phaseKey 且源已存在则跳过重建（不用字节长度推断）。
  // 图层顺序：polity insert before corridor-line（若已存在），走廊保持上层。
  const polityVersionRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    // snapshot=null：跨 phase 清空，旧 polity 不呈现（§5）
    if (!snapshot) {
      clearPolityLayers(map, polityLabelsRef);
      polityVersionRef.current = null;
      return;
    }
    // map 已就绪且 style 已加载：直接应用；否则等 idle 后应用。
    // （mapReady 来自 "load"，style 通常已加载；但大区 addSource 可能仍在排队，
    //  isStyleLoaded() 为 false 时延迟到 idle，避免 addSource 抛错。）
    const apply = () => applyPolityToMap(map, snapshot, phaseKey, {
      versionRef: polityVersionRef,
      labelsRef: polityLabelsRef,
      createMarker: (props, anchor) => {
        const ml = maplibreglRef.current;
        if (!ml) return null;
        const node = createPolityLabelNode(props);
        return new ml.Marker({ element: node, anchor: "center" })
          .setLngLat(anchor)
          .addTo(map);
      },
    });
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("idle", () => {
        // 守卫：若期间 phaseKey 已变（新 snapshot 到达），不回写旧值。
        // applyPolityToMap 内部用 phaseKey+versionRef 幂等，过期 apply 会被跳过。
        if (mapRef.current !== map) return;
        apply();
      });
    }
  }, [snapshot, phaseKey, mapReady]);

  // 走廊层：corridors 常驻，按 selectedYear 过滤（from/to 两端包含；
  // 无 from/to 的走廊按上游定义「一直显示」，与 corridorActiveAt 一致）。
  // mapReady 纳入 deps 以解决与 init 的竞态。
  const corridorsVersionRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !corridors) return;
    const apply = () => {
      const applied = applyCorridorsToMap(map, corridors, "corridors", {
        versionRef: corridorsVersionRef,
      });
      // 无论新建或已存在，都更新过滤
      const m = mapRef.current;
      if (m && m.getLayer("corridor-line")) {
        m.setFilter("corridor-line", corridorYearFilter(selectedYear));
      }
      return applied;
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("idle", () => {
        if (mapRef.current !== map) return;
        apply();
      });
    }
  }, [corridors, selectedYear, mapReady]);

  const attributionText = buildBasemapAttribution(basemapOnline === true);

  return (
    <div className="exploration-map-canvas" ref={mapNodeRef}>
      {basemapOnline !== null ? (
        <div className="history-map-attribution" role="contentinfo">
          {attributionText}
        </div>
      ) : null}
      {/* 近似 / 现代底图提示 + 数据来源（§2/§3/§5 护栏：明确显示不确定性与来源，不伪称法律审核通过）*/}
      <div className="exploration-map-notice" role="note">
        <p className="exploration-map-notice__main">
          示意 · 近似复原 · 底图为现代地理参考，河道等可能与古代不同
        </p>
        <p className="exploration-map-notice__source">
          政权数据源自江山时序（jiangshan-map）/ historical-basemaps 社区导出；
          示意复原，未经法律与发布合规审核。
        </p>
      </div>
      {error ? (
        <div className="exploration-map-error" role="alert">
          地图加载失败：{error}
        </div>
      ) : null}
    </div>
  );
}
