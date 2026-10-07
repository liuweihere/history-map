"use client";

import { useEffect, useRef, useState } from "react";

import { REGION_GEOJSON_PATH, regionIdForStory } from "../lib/history-regions";

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
  const [regionsReady, setRegionsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!mapNodeRef.current || mapRef.current) return;

      const maplibregl = (await import("maplibre-gl")).default;

      if (cancelled) return;

      const { style: basemapStyle, online: basemapOnline } = await loadBasemapStyle();
      if (cancelled) return;
      mapNodeRef.current.classList.toggle("map--basemap-off", !basemapOnline);

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

        const regionsPromise = fetch(REGION_GEOJSON_PATH)
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

        Promise.all([regionsPromise]).then(([regions]) => {
            if (cancelled || !mapRef.current) return;

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

          // ── 历史政权叠加层（可选，第 3 层）────────────────────────
          // 战争/割据故事（scene.overlay_boundary 有值）淡入政权色块，
          // 同时压低常驻 8 大区透明度让位；传记故事保持纯净大区底座。
          const overlayId = story.scene?.overlay_boundary ?? null;
          if (overlayId) {
            const boundaryPromise = fetch(`/data/historical/${overlayId}.geojson`)
              .then((response) => (response.ok ? response.json() : null))
              .catch(() => null);

            boundaryPromise.then((boundary) => {
              if (cancelled || !mapRef.current || !boundary) return;
              if (!map.getLayer("regions-fill")) return;

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
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      regionLabelsRef.current.forEach((marker) => marker.remove());
      regionLabelsRef.current = [];
      historicalLabelsRef.current.forEach((marker) => marker.remove());
      historicalLabelsRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setRegionsReady(false);
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

  return <div className="history-map-canvas" ref={mapNodeRef} />;
}
