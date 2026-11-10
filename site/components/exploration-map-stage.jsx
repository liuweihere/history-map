"use client";

import React, { useEffect, useRef, useState } from "react";

import { REGION_GEOJSON_PATH } from "../lib/history-regions";
import { buildBasemapAttribution } from "../lib/basemap-attribution";
import {
  polityColor,
  polityAnchor,
  corridorActiveAt,
} from "../lib/jiangshan-data";

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
 * @param {object|null} corridors  corridors.geojson（常驻）
 * @param {number} selectedYear  当前所选年份（用于走廊过滤）
 * @param {object|null} initialCamera  恢复的视角 {center:[lng,lat], zoom}
 * @param {function|null} onCameraChange  视角变化上报（往返恢复用）
 */
export function ExplorationMapStage({ snapshot, corridors, selectedYear, initialCamera, onCameraChange }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const polityLabelsRef = useRef([]);
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

  // ── 政权快照 + 走廊：随 snapshot / corridors / selectedYear 更新 ──
  // 同 phase（snapshot 不变）只更新走廊过滤，不重建快照源。
  // 防过期回写：style 未加载时延迟到 idle 应用，但用 revision 守卫——
  // 新 snapshot 到来后旧 idle 回调捕获的旧 snapshot 不再回写。
  const snapshotVersionRef = useRef(null);
  const latestSnapshotRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !snapshot) return;
    latestSnapshotRef.current = snapshot;
    const mySnapshot = snapshot;
    if (!map.isStyleLoaded()) {
      // 等待 style load 后再挂；用 once 避免漏挂
      map.once("idle", () => {
        // 守卫：若期间已有更新的 snapshot，丢弃本次（旧 snapshot 不回写）
        if (latestSnapshotRef.current !== mySnapshot) return;
        applySnapshot();
      });
      return;
    }
    applySnapshot();

    function applySnapshot() {
      if (!mapRef.current) return;
      // 守卫：仅应用最新 snapshot（防止延迟回调过期回写）
      if (latestSnapshotRef.current !== mySnapshot) return;
      const version = mySnapshot.__v ?? JSON.stringify(mySnapshot).length;
      // 同 snapshot 不重复重建
      if (snapshotVersionRef.current === version && map.getSource("jiangshan-polity")) return;
      snapshotVersionRef.current = version;

      // 清旧
      if (map.getLayer("polity-fill")) map.removeLayer("polity-fill");
      if (map.getSource("jiangshan-polity")) map.removeSource("jiangshan-polity");
      polityLabelsRef.current.forEach((m) => m.remove());
      polityLabelsRef.current = [];

      map.addSource("jiangshan-polity", {
        type: "geojson",
        data: mySnapshot,
      });
      // 政权填色淡化（0.32），不堆色块；色由 display_color→tint→安全色
      map.addLayer({
        id: "polity-fill",
        type: "fill",
        source: "jiangshan-polity",
        paint: {
          "fill-color": ["coalesce", ["get", "display_color"], ["get", "tint"], "#D9C7A8"],
          "fill-opacity": 0.32,
          "fill-outline-color": "rgba(60,40,20,0.18)",
        },
      });

      // 政权锚点标签（DOM Marker，properties.title / anchor）
      polityLabelsRef.current = (mySnapshot.features ?? [])
        .map((f) => {
          const props = f.properties ?? {};
          const anchor = polityAnchor(props);
          if (!anchor || !props.title) return null;
          const node = createPolityLabelNode(props);
          return new maplibregl.Marker({ element: node, anchor: "center" })
            .setLngLat(anchor)
            .addTo(map);
        })
        .filter(Boolean);
    }
  }, [snapshot]);

  // 走廊层：corridors 常驻，按 selectedYear 过滤（from/to 两端包含；
  // 无 from/to 的走廊按上游定义「一直显示」，与 corridorActiveAt 一致）
  const corridorsVersionRef = useRef(null);
  const latestCorridorsRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !corridors) return;
    latestCorridorsRef.current = corridors;
    const myCorridors = corridors;
    if (!map.isStyleLoaded()) {
      map.once("idle", () => {
        if (latestCorridorsRef.current !== myCorridors) return; // 守卫：丢弃过期回写
        applyCorridors();
      });
      return;
    }
    applyCorridors();

    function applyCorridors() {
      if (!mapRef.current) return;
      if (latestCorridorsRef.current !== myCorridors) return;
      const version = myCorridors.__v ?? JSON.stringify(myCorridors).length;
      if (corridorsVersionRef.current === version && map.getSource("jiangshan-corridors")) {
        // 同 corridors 只更新过滤
        updateFilter();
        return;
      }
      corridorsVersionRef.current = version;

      if (map.getLayer("corridor-line")) map.removeLayer("corridor-line");
      if (map.getSource("jiangshan-corridors")) map.removeSource("jiangshan-corridors");

      map.addSource("jiangshan-corridors", { type: "geojson", data: myCorridors });
      // 走廊在上层（polity 之上）：用 line，棕褐色虚线
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
      updateFilter();
    }

    function updateFilter() {
      const m = mapRef.current;
      if (!m || !m.getLayer("corridor-line")) return;
      // from<=year<=to 两端包含；from/to 缺失（无 span）→ 一直显示
      m.setFilter("corridor-line", [
        "any",
        ["!", ["all", ["has", "from"], ["has", "to"]]],
        ["all", ["<=", ["get", "from"], selectedYear], [">=", ["get", "to"], selectedYear]],
      ]);
    }
  }, [corridors, selectedYear]);

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
