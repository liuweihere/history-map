"use client";

import { useEffect, useRef, useState } from "react";

import { REGION_GEOJSON_PATH, regionIdForStory } from "../lib/history-regions";
import { buildBasemapAttribution } from "../lib/basemap-attribution";
import {
  resolveStorySnapshotRef,
  snapshotUrlForRef,
  verifySnapshotBytes,
  verifyBytesAgainstManifest,
  mapRefBadgeText,
  decideMapRefLoad,
  mapRefStatusOnApprovedFailure,
  isByteVerificationAvailable,
  JIANGSHAN_INDEX_URL,
} from "../lib/jiangshan-data.js";
import {
  applyPolityToMap,
  clearPolityLayers,
} from "../lib/exploration-map-layers.js";

// jiangshan manifest 路径（与 index 同目录）
const JIANGSHAN_MANIFEST_URL = "/data/jiangshan/manifest.json";

function formatYear(year) {
  if (year < 0) return `前${Math.abs(year)}`;
  return String(year);
}

function createMarkerNode(kind, label, subtitle, year, onClick) {
  const wrapper = document.createElement("div");
  wrapper.className = `map-marker map-marker--${kind}`;

  const anchor = document.createElement("span");
  anchor.className = "map-marker__anchor";

  const halo = document.createElement("span");
  halo.className = "map-marker__halo";

  const dot = document.createElement("span");
  dot.className = "map-marker__dot";

  const sigil = document.createElement("span");
  sigil.className = "map-marker__sigil";

  const labelBox = document.createElement("span");
  labelBox.className = "map-marker__label";
  labelBox.innerHTML =
    `<strong>${label}</strong><em>${subtitle}</em>` +
    (year === null || year === undefined ? "" : `<small>${formatYear(year)}</small>`);
  anchor.append(halo, dot, sigil);
  wrapper.append(anchor, labelBox);

  if (typeof onClick === "function") {
    wrapper.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
  }

  return wrapper;
}

function createRegionLabelNode(region) {
  const wrapper = document.createElement("div");
  wrapper.className = "region-label";
  wrapper.dataset.regionId = region.id;

  const name = document.createElement("span");
  name.className = "region-label__name";
  name.textContent = region.name;

  const subtitle = document.createElement("span");
  subtitle.className = "region-label__subtitle";
  subtitle.textContent = region.subtitle;

  wrapper.append(name, subtitle);
  return wrapper;
}

// 政权标签节点（魏/蜀/吴/汉/西楚）：大字 + 都城小注
function createFactionLabelNode(props) {
  const wrapper = document.createElement("div");
  wrapper.className = "faction-label";

  const name = document.createElement("span");
  name.className = "faction-label__name";
  name.textContent = props.name;

  if (props.capital) {
    const capital = document.createElement("span");
    capital.className = "faction-label__capital";
    capital.textContent = `都 ${props.capital}`;
    wrapper.append(name, capital);
  } else {
    wrapper.append(name);
  }
  return wrapper;
}

// 政权快照标签节点构造：jiangshan polity feature properties 用 title 字段（非 name）。
// applyPolityToMap 的 createMarker 回调签名是 (props, anchor) → Marker；
// 必须返回真正的 maplibregl.Marker（setLngLat + addTo），否则标签不挂地图且
// 无法正确 remove（探索态参考 ExplorationMapStage 同款实现）。
function createPolityMarker(props, anchor, maplibregl, map) {
  const ml = maplibregl;
  if (!ml || !map) return null;
  const node = createFactionLabelNode({
    name: props.title ?? "",
    capital: props.capital ?? null,
  });
  node.classList.add("faction-label--polity");
  return new ml.Marker({ element: node, anchor: "center" })
    .setLngLat(anchor)
    .addTo(map);
}

// ── 现成矢量底图（CartoDB Positron）─────────────────────────────────
// 暖米色极简底图，自带海岸线/大江大河/水系，业务数据只作半透明 overlay。
// 离线或 CDN 不可达时退化为羊皮纸纯色底，保证地图永不空白。
const BASEMAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const FALLBACK_BASEMAP_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "parchment-base",
      type: "background",
      paint: { "background-color": "#EFE9DC" },
    },
  ],
};

async function loadBasemapStyle() {
  try {
    const response = await fetch(BASEMAP_STYLE_URL);
    if (!response.ok) throw new Error(`basemap style HTTP ${response.status}`);
    const style = await response.json();
    return { style, online: true };
  } catch (error) {
    console.warn("[history-map] basemap unavailable, fallback to parchment:", error);
    return { style: FALLBACK_BASEMAP_STYLE, online: false };
  }
}

export function HistoryMapStage({ story, onSelectPlace, focusRegion }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const regionLabelsRef = useRef([]);
  const historicalLabelsRef = useRef([]);
  const regionsGeojsonRef = useRef(null);
  const flyToRegionRef = useRef(null);
  const polityVersionRef = useRef(null);
  const polityLabelsRef = useRef([]);
  const maplibreglRef = useRef(null);
  const loadAbortRef = useRef(null);
  // Phase 2 缺陷修复②：当前挂载故事的身份锚（effect 每次运行时写入）。
  // 旧 load 回调的 async 续体凭 boundStoryId 与此值比对，判定自己是否过期。
  const storyIdentityRef = useRef(null);
  const [regionsReady, setRegionsReady] = useState(false);
  const [basemapOnline, setBasemapOnline] = useState(null);
  // Phase 2 · 故事地图参考审定绑定 UI 状态。
  // mapRefStatus: { kind: "approved"|"proposed"|"none", snapshot_id, rationale, reason? }
  // approved → 已加载审定快照（显示理由）；proposed → 候选待审（手绘回退，显示候选）；
  // none → 手绘回退（reason 标明退化原因）。
  const [mapRefStatus, setMapRefStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // 缺陷修复②：进入即声明本 effect 拥有的故事身份；卸载/重跑时清空。
    storyIdentityRef.current = story?.story_id ?? null;

    async function init() {
      if (!mapNodeRef.current || mapRef.current) return;

      const maplibregl = (await import("maplibre-gl")).default;

      if (cancelled) return;
      maplibreglRef.current = maplibregl;

      const { style: basemapStyle, online: basemapOnline } = await loadBasemapStyle();
      if (cancelled) return;
      mapNodeRef.current.classList.toggle("map--basemap-off", !basemapOnline);

      // 底图署名（§5 #9）：attributionControl 关闭后自绘 credit，
      // 在线显示 Carto 署名，离线纯色 fallback 诚实标注回退底图，不伪报 Carto。
      // 完整许可评估为人工关卡，此处只呈现署名文本。
      setBasemapOnline(basemapOnline);

      const map = new maplibregl.Map({
        container: mapNodeRef.current,
        // 现成 CartoDB Positron 底图：海岸线/水系自动呈现（2026-10-07 架构修正）
        style: basemapStyle,
        // 中文标签关键：CJK 字形用客户端本地字体（苹方/雅黑）即时生成 SDF，
        // 拉丁字符仍走 style 的 CDN pbf —— 无需托管数十兆中文字体切片
        localIdeographFontFamily:
          "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif",
        center: [108.5, 35.5],
        zoom: 3.6,
        minZoom: 2.8,
        maxZoom: 7.2,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });

      mapRef.current = map;

      // ── 海洋/陆地底色重调（经典历史地图风格）────────────────────────
      // 浅蓝海洋包裹米白陆地，海岸线沿水体边沿自然加深。
      map.on("style.load", () => {
        if (map.getLayer("water")) {
          map.setPaintProperty("water", "fill-color", "#A2C9E6");
        }
        if (map.getLayer("water_shadow")) {
          map.setPaintProperty("water_shadow", "fill-color", "#B4D2E9");
        }
        if (map.getLayer("background")) {
          map.setPaintProperty("background", "background-color", "#F6F3EB");
        }
        if (map.getLayer("waterway")) {
          map.setPaintProperty("waterway", "line-color", "#77A3C7");
        }
        if (map.getLayer("boundary_country_inner")) {
          map.setPaintProperty("boundary_country_inner", "line-color", "#B8A98D");
        }

        // ── 底图标签汉化（简体中文）─────────────────────────────────
        // 瓦片自带 name:zh 字段；CJK 字形由 localIdeographFontFamily
        // 在客户端本地渲染（苹方/雅黑），拉丁 pbf 照常走 CDN。
        for (const layer of map.getStyle().layers) {
          if (layer.type !== "symbol") continue;
          const textField = layer.layout?.["text-field"];
          if (!textField) continue;
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
        const scene = story.scene;
        if (!scene?.geojson) {
          throw new Error(`No map scene geojson exported for ${story.story_id}.`);
        }

        // Phase 2 缺陷修复②：本 load 回调绑定的故事身份。所有 async 续体
        // （index 字节校验、快照 fetch、overlay fetch）在写图层/状态前必须
        // 比对此 id 与最新挂载故事一致 —— 仅靠 cancelled/signal 不足以覆盖
        // 「effect 重跑但旧 map 未销毁前的新旧回调交错」窗口（§7 竞态护栏）。
        const boundStoryId = story.story_id;
        const storyStillCurrent = () =>
          !cancelled && storyIdentityRef.current === boundStoryId;

        // AbortController：故事切换/卸载时取消在途 fetch，旧请求不向已移除 map
        // addSource 或 set state（§5 stale 不覆盖；§7 竞态护栏）。
        const loadController = new AbortController();
        loadAbortRef.current = loadController;
        const { signal } = loadController;

        const regionsPromise = fetch(REGION_GEOJSON_PATH, { signal })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null);

        // Phase 2 · 审定地图参考：并行加载 jiangshan index + manifest 解析 map_ref。
        // index 以 arrayBuffer 取回，用于 phase 解析前先校验响应字节完整性
        // （防止 index 内容变更而 manifest 不变 → phase 解析基于被篡改的 index）。
        // 字节校验不可用（非安全上下文）→ approved 不得加载（见 decideMapRefLoad）。
        const indexPromise = fetch(JIANGSHAN_INDEX_URL, { signal })
          .then(async (response) => {
            if (!response.ok) return null;
            const buf = await response.arrayBuffer();
            return { buf, json: null }; // json 延迟到字节校验后解析
          })
          .catch(() => null);
        const manifestPromise = fetch(JIANGSHAN_MANIFEST_URL, { signal })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null);

        const [west, south, east, north] = scene.bounds;
        map.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          {
            padding: { top: 52, right: 56, bottom: 52, left: 56 },
            duration: 0,
          },
        );

        Promise.all([regionsPromise, indexPromise, manifestPromise]).then(
          async ([regions, indexResult, manifest]) => {
            if (!storyStillCurrent() || !mapRef.current || signal.aborted) return;

            const byteCheckAvailable = isByteVerificationAvailable();

            // index 字节校验：manifest 存在且字节校验可用时，先校验 index 响应
            // 字节再解析；失败 → data_load_failed（不基于未校验 index 解析 phase）。
            let index = null;
            if (indexResult && manifest && byteCheckAvailable) {
              try {
                const indexOk = await verifyBytesAgainstManifest(
                  indexResult.buf,
                  manifest,
                  "index.json",
                );
                // Phase 2 缺陷修复②（F3）：index 字节校验 digest 是 async 续体的
                // 关键让出点。切故事发生在该 digest 内时，cleanup 已把
                // storyIdentityRef 改写为新故事、旧 map 已 remove、旧 signal 已
                // abort，但本续体在 digest 前的 line 302 守卫已过 —— 此处必须
                // 重新校验身份，否则会向已 remove 的旧 map addSource("story001-overlay")
                // 等并继续 resolveStorySnapshotRef/decideMapRefLoad（§7 竞态护栏）。
                if (!storyStillCurrent() || !mapRef.current || signal.aborted) return;
                if (indexOk) {
                  index = JSON.parse(new TextDecoder().decode(indexResult.buf));
                }
              } catch {
                index = null;
              }
            }
            // 字节校验不可用时仍允许 index 解析（approved 会被 decideMapRefLoad 拦截）；
            // 这里只在没有 buf 的旧路径上兼容直接 json。
            if (!index && indexResult?.json) index = indexResult.json;

            // 解析审定参考；index/manifest 加载失败 → data_load_failed（诚实退化）
            const ref = index && manifest
              ? resolveStorySnapshotRef(index, manifest, story)
              : {
                  kind: "none",
                  reason: "data_load_failed",
                  snapshot_id: story?.map_plan?.map_ref?.snapshot_id ?? null,
                  rationale: null,
                };

            // approved 准入：字节校验不可用（非安全 LAN）→ 不加载，降级提示
            const loadPlan = decideMapRefLoad(ref, { byteCheckAvailable });

            // 先记录 proposed/none 状态（approved 成功后才覆盖为 approved）
            if (!loadPlan.shouldLoad) {
              setMapRefStatus(loadPlan.statusOnSkip ?? {
                kind: ref.kind,
                snapshot_id: ref.snapshot_id,
                rationale: ref.rationale,
                reason: ref.reason,
              });
            }

            let approvedApplied = false;

            // 业务 overlay：只挂故事路线（海岸线/水系由底图自动提供）
            map.addSource("story001-overlay", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: [...scene.geojson.features],
              },
            });

            // ── 常驻历史地理大区（固定舞台）────────────────────────────
            // 叠放序（架构定稿）：CartoDB 底图 → 大区水彩 → 故事路线 → 标记。
            if (regions && Array.isArray(regions.features) && regions.features.length > 0) {
              regionsGeojsonRef.current = regions;

              map.addSource("history-regions", {
                type: "geojson",
                data: regions,
              });

              map.addLayer({
                id: "regions-fill",
                type: "fill",
                source: "history-regions",
                paint: {
                  "fill-color": ["get", "color"],
                  // 马卡龙水彩版图（2026-10-07 视觉全面对齐）：
                  // 未选中 0.45 / 高亮 0.75，色号由 regions.geojson color 驱动
                  "fill-opacity": [
                    "case",
                    ["boolean", ["feature-state", "highlight"], false],
                    0.75,
                    0.45,
                  ],
                },
              });

              // 大区名标签：style 无 glyphs，用 DOM Marker（plan.md 约束）
              flyToRegionRef.current = (regionProps) => {
                if (!mapRef.current || !regionProps?.label_position) return;

                mapRef.current.flyTo({
                  center: regionProps.label_position,
                  zoom: regionProps.focus_zoom ?? 6,
                  duration: 1500,
                });

                const featureId = regionProps.__featureId;
                if (Number.isInteger(featureId)) {
                  mapRef.current.setFeatureState(
                    { source: "history-regions", id: featureId },
                    { highlight: true },
                  );
                  setTimeout(() => {
                    if (mapRef.current) {
                      mapRef.current.setFeatureState(
                        { source: "history-regions", id: featureId },
                        { highlight: false },
                      );
                    }
                  }, 4000);
                }
              };

              regionLabelsRef.current = regions.features
                .filter((feature) => feature.properties?.label_position)
                .map((feature) => {
                  const node = createRegionLabelNode(feature.properties);
                  node.addEventListener("click", (event) => {
                    event.stopPropagation();
                    flyToRegionRef.current?.({ ...feature.properties, __featureId: feature.id });
                  });
                  return new maplibregl.Marker({
                    element: node,
                    anchor: "center",
                  })
                    .setLngLat(feature.properties.label_position)
                    .addTo(map);
                });

              map.on("click", "regions-fill", (event) => {
                const feature = event.features?.[0];
                if (!feature) return;
                // GeoJSON source 查询结果里 label_position 会退化为字符串，回查源数据
                const regionFeature = regions.features.find(
                  (candidate) => candidate.properties?.id === feature.properties.id,
                );
                if (regionFeature) {
                  flyToRegionRef.current?.({ ...regionFeature.properties, __featureId: regionFeature.id });
                }
              });

              setRegionsReady(true);
            }

          // ── approved 审定快照：在 regions-fill 之后加载，保证政权层在大区
          //    之上（issue 4：approved 先于 regions-fill 会被大区遮盖）。
          //    字节校验失败 / fetch 失败 / 切换竞态 → mapRefStatusOnApprovedFailure
          //    降级为 none（不得保留 approved 谎称审定），走手绘回退。
          if (loadPlan.shouldLoad) {
            const snapUrl = snapshotUrlForRef(ref);
            if (snapUrl) {
              try {
                const snapResponse = await fetch(snapUrl, { signal });
                if (snapResponse.ok !== true) {
                  throw new Error(`snapshot HTTP ${snapResponse.status}`);
                }
                if (!storyStillCurrent() || !mapRef.current || signal.aborted) return;
                const snapBuf = await snapResponse.arrayBuffer();
                if (!storyStillCurrent() || !mapRef.current || signal.aborted) return;
                const bytesOk = await verifySnapshotBytes(
                  new Uint8Array(snapBuf),
                  manifest,
                  ref.snapshot_id,
                );
                if (!bytesOk) {
                  throw new Error("snapshot byte integrity check failed");
                }
                const snapshot = JSON.parse(new TextDecoder().decode(snapBuf));
                if (!storyStillCurrent() || !mapRef.current || signal.aborted) return;
                // Phase 2 缺陷修复①：regions 缺失（404）只跳过政权叠加大区让位，
                // 不再提前 return —— approved 快照仍可加载（政权层不依赖大区层），
                // 后续路线/标记/徽章装配继续（§5「加载失败不展示过期地图」反面：
                // 局部缺失不得坍塌整个故事现场）。
                const hasRegionsLayer = map.getLayer("regions-fill");
                applyPolityToMap(map, snapshot, `story-ref::${ref.snapshot_id}`, {
                  versionRef: polityVersionRef,
                  labelsRef: polityLabelsRef,
                  createMarker: (props, anchor) =>
                    createPolityMarker(props, anchor, maplibreglRef.current, map),
                });
                // 大区让位（与手绘 overlay 一致），政权浮于其上；无大区则跳过
                if (hasRegionsLayer) {
                  map.setPaintProperty("regions-fill", "fill-opacity", [
                    "case",
                    ["boolean", ["feature-state", "highlight"], false],
                    0.45,
                    0.28,
                  ]);
                }
                approvedApplied = true;
                setMapRefStatus({
                  kind: "approved",
                  snapshot_id: ref.snapshot_id,
                  rationale: ref.rationale,
                });
              } catch (err) {
                if (signal.aborted || !storyStillCurrent()) return; // 切换取消/过期续体，静默
                console.warn(
                  "[history-map] approved snapshot load failed, fallback to hand-drawn:",
                  err,
                );
                // 关键：降级为 none，不得保留 approved（地图回退却谎称审定）；
                // 且仅当本续体仍是当前故事时才允许覆盖状态（缺陷修复②）。
                setMapRefStatus(mapRefStatusOnApprovedFailure(ref, "snapshot_load_failed"));
              }
            }
          }

          // ── 历史政权叠加层（可选，第 3 层）────────────────────────
          // 战争/割据故事（scene.overlay_boundary 有值）淡入政权色块，
          // 同时压低常驻 8 大区透明度让位；传记故事保持纯净大区底座。
          // Phase 2：approved 审定快照已加载时跳过手绘回退；proposed/none/
          // approved失败均走手绘 overlay_boundary（保留回退，§3）。
          const overlayId = story.scene?.overlay_boundary ?? null;
          if (overlayId && !approvedApplied) {
            const boundaryPromise = fetch(`/data/historical/${overlayId}.geojson`)
              .then((response) => (response.ok ? response.json() : null))
              .catch(() => null);

            boundaryPromise.then((boundary) => {
              if (!storyStillCurrent() || !mapRef.current || !boundary) return;
              // Phase 2 缺陷修复①：手绘回退政权层不依赖大区层存在；
              // regions 缺失时仍添加 overlay（后续 setPaintProperty 自守卫）。
              map.addSource("historical-boundary", {
                type: "geojson",
                data: boundary,
              });

              map.addLayer({
                id: "historical-fill",
                type: "fill",
                source: "historical-boundary",
                paint: {
                  "fill-color": ["get", "color"],
                  // 政权是“浮层”不是“遮挡层”（2026-10-07 修正）：
                  // 透明度调低，让 8 大区水彩与底图地理仍可透出
                  "fill-opacity": [
                    "case",
                    ["boolean", ["feature-state", "highlight"], false],
                    0.5,
                    0.3,
                  ],
                  "fill-opacity-transition": { duration: 900, delay: 0 },
                },
              });

              // 政权名标签：DOM Marker（kind: faction）
              historicalLabelsRef.current = boundary.features
                .filter((feature) => feature.properties?.name)
                .map((feature) => {
                  const ring = feature.geometry.coordinates[0];
                  const centroid = ring
                    .reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0])
                    .map((v) => v / ring.length);
                  const node = createFactionLabelNode(feature.properties);
                  return new maplibregl.Marker({ element: node, anchor: "center" })
                    .setLngLat(centroid)
                    .addTo(map);
                });

              // 常驻 8 大区轻微让位但不消失（0.45→0.28）：
              // 大区水彩底纹仍是地理参照，政权色块浮于其上
              if (map.getLayer("regions-fill")) {
                map.setPaintProperty("regions-fill", "fill-opacity", [
                  "case",
                  ["boolean", ["feature-state", "highlight"], false],
                  0.45,
                  0.28,
                ]);
              }
            });
          }

          map.addLayer({
            id: "story-route-line",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "route"],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              // 古风棕褐色路线虚线（如 南阳 ➔ 长沙 人生路线）；
              // 只渲染故事数据里的 LineString/MultiLineString，绝无点线转多边形。
              "line-color": ["coalesce", ["get", "color"], "#8B5A2B"],
              "line-width": 2.5,
              "line-opacity": 0.85,
              "line-dasharray": [2, 2],
            },
          });

            // 故事加载后按 regionIdForStory() 高亮所在大区（显式覆盖表优先，PIP 回退）
            if (regions) {
              const regionId = regionIdForStory(regions, story);
              if (regionId) {
                const regionFeature = regions.features.find(
                  (candidate) => candidate.properties?.id === regionId,
                );
                if (regionFeature && Number.isInteger(regionFeature.id)) {
                  map.setFeatureState(
                    { source: "history-regions", id: regionFeature.id },
                    { highlight: true },
                  );
                }
              }
            }

            const placeById = new Map(story.places.map((place) => [place.id, place]));

            markersRef.current = (scene.markers ?? [])
              .map((marker) => {
                const place = placeById.get(marker.place_id);
                if (!place) return null;

                const handleSelect = () => {
                  if (!mapRef.current) return;
                  mapRef.current.flyTo({
                    center: [place.lng, place.lat],
                    zoom: 6.5,
                    duration: 1500,
                  });
                  onSelectPlace?.(place);
                };

                return new maplibregl.Marker({
                  element: createMarkerNode(marker.kind, place.map_label, marker.subtitle, story.timeline.year, handleSelect),
                  anchor: "left",
                })
                  .setLngLat([place.lng, place.lat])
                  .addTo(map);
              })
              .filter(Boolean);
          },
        );
      });
    }

    init();

    return () => {
      cancelled = true;
      storyIdentityRef.current = null;
      try { loadAbortRef.current?.abort(); } catch { /* noop */ }
      loadAbortRef.current = null;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      regionLabelsRef.current.forEach((marker) => marker.remove());
      regionLabelsRef.current = [];
      historicalLabelsRef.current.forEach((marker) => marker.remove());
      historicalLabelsRef.current = [];
      polityLabelsRef.current.forEach((marker) => marker && marker.remove && marker.remove());
      polityLabelsRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setRegionsReady(false);
      setMapRefStatus(null);
    };
  }, [story]);

  // focusRegion prop：外部（时间轨 preview 节点）请求聚焦某大区 → flyTo + 高亮。
  // nonce 保证同一个大区连续点击也能重新触发。
  useEffect(() => {
    const map = mapRef.current;
    const regions = regionsGeojsonRef.current;
    if (!map || !regionsReady || !focusRegion?.id || !regions) return;

    const feature = regions.features.find(
      (candidate) => candidate.properties?.id === focusRegion.id,
    );
    if (!feature) return;

    const { label_position: labelPosition, focus_zoom: focusZoom } = feature.properties;

    map.flyTo({
      center: labelPosition,
      zoom: focusZoom ?? 6,
      duration: 1500,
    });

    const featureId = feature.id;
    if (Number.isInteger(featureId)) {
      map.setFeatureState(
        { source: "history-regions", id: featureId },
        { highlight: true },
      );
    }

    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.setFeatureState(
          { source: "history-regions", id: featureId },
          { highlight: false },
        );
      }
    }, 6000);

    return () => clearTimeout(timer);
  }, [focusRegion, regionsReady]);

  const attributionText = buildBasemapAttribution(basemapOnline === true);

  // Phase 2 · 审定地图参考状态徽章（§2 故事学习状态：所选参考快照、理由分别显示）
  const refBadge = mapRefBadgeText(mapRefStatus);

  return (
    <div className="history-map-canvas" ref={mapNodeRef}>
      {basemapOnline !== null ? (
        <div className="history-map-attribution" role="contentinfo">
          {attributionText}
        </div>
      ) : null}
      {refBadge ? (
        <div className={refBadge.className} role="status">
          {refBadge.text}
        </div>
      ) : null}
    </div>
  );
}
