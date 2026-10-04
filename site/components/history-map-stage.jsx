"use client";

import { useEffect, useRef, useState } from "react";

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

function buildDynastyFilter(year) {
  return [
    "all",
    ["<=", ["get", "start_year"], year],
    [">=", ["get", "end_year"], year],
  ];
}

export function HistoryMapStage({ story, currentYear, onSelectPlace }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [dynastyLayersReady, setDynastyLayersReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!mapNodeRef.current || mapRef.current) return;

      const maplibregl = (await import("maplibre-gl")).default;

      if (cancelled) return;

      const map = new maplibregl.Map({
        container: mapNodeRef.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "parchment-base",
              type: "background",
              paint: {
                "background-color": "#E8F3F7",
              },
            },
          ],
        },
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

      map.on("load", () => {
        const scene = story.scene;
        if (!scene?.geojson) {
          throw new Error(`No map scene geojson exported for ${story.story_id}.`);
        }

        const chinaBackdropPromise = fetch("/data/static/china-base.geojson").then((response) => {
          if (!response.ok) {
            throw new Error("Failed to load china-base.geojson.");
          }

          return response.json();
        });

        const dynastiesPromise = fetch("/data/static/dynasties.geojson")
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

        Promise.all([chinaBackdropPromise, dynastiesPromise]).then(([chinaBackdrop, dynasties]) => {
          if (cancelled || !mapRef.current) return;

          map.addSource("story001-overlay", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [...chinaBackdrop.features, ...scene.geojson.features],
            },
          });

          map.addLayer({
            id: "china-backdrop-fill",
            type: "fill",
            source: "story001-overlay",
            filter: ["==", ["get", "id"], "china-backdrop"],
            paint: {
              "fill-color": "#F8F2E8",
              "fill-opacity": 1,
            },
          });

          map.addLayer({
            id: "china-backdrop-shadow",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "id"], "china-backdrop"],
            paint: {
              "line-color": "#D8C8B5",
              "line-width": 3,
              "line-blur": 2,
              "line-opacity": 0.3,
            },
          });

          map.addLayer({
            id: "china-backdrop-outline",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "id"], "china-backdrop"],
            paint: {
              "line-color": "#D8C8B5",
              "line-width": 1,
              "line-opacity": 0.9,
            },
          });

          if (dynasties && Array.isArray(dynasties.features) && dynasties.features.length > 0) {
            map.addSource("dynasty-boundaries", {
              type: "geojson",
              data: dynasties,
            });

            map.addLayer({
              id: "dynasties-fill",
              type: "fill",
              source: "dynasty-boundaries",
              filter: buildDynastyFilter(currentYear),
              paint: {
                "fill-color": ["get", "color"],
                "fill-opacity": 0.3,
              },
            });

            map.addLayer({
              id: "dynasties-line",
              type: "line",
              source: "dynasty-boundaries",
              filter: buildDynastyFilter(currentYear),
              paint: {
                "line-color": "#C4B49A",
                "line-width": 1.2,
                "line-opacity": 0.6,
                "line-dasharray": [2, 1],
              },
            });
          }

          map.addLayer({
            id: "han-heartland-fill",
            type: "fill",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "heartland"],
            paint: {
              "fill-color": ["coalesce", ["get", "color"], "#EEDC9A"],
              "fill-opacity": 0.3,
            },
          });

          map.addLayer({
            id: "han-heartland-outline",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "heartland"],
            paint: {
              "line-color": ["coalesce", ["get", "color"], "rgba(146, 116, 64, 0.8)"],
              "line-width": 1.6,
              "line-opacity": 0.78,
              "line-dasharray": [2, 2],
            },
          });

          map.addLayer({
            id: "yellow-turban-disturbance-fill",
            type: "fill",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "disturbance"],
            paint: {
              "fill-color": ["coalesce", ["get", "color"], "#A07533"],
              "fill-opacity": 0.25,
            },
          });

          map.addLayer({
            id: "yellow-turban-disturbance-outline",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "disturbance"],
            paint: {
              "line-color": ["coalesce", ["get", "color"], "rgba(160, 117, 51, 0.72)"],
              "line-width": 1.6,
              "line-opacity": 0.88,
            },
          });

          map.addLayer({
            id: "yellow-river-axis-line",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "route"],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": ["coalesce", ["get", "color"], "#8B6A4A"],
              "line-width": 2,
              "line-opacity": 0.72,
              "line-dasharray": [3, 2],
            },
          });

          setDynastyLayersReady(true);

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
        });
      });
    }

    init();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setDynastyLayersReady(false);
    };
  }, [story]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dynastyLayersReady) return;

    const filter = buildDynastyFilter(currentYear);
    if (map.getLayer("dynasties-fill")) {
      map.setFilter("dynasties-fill", filter);
    }
    if (map.getLayer("dynasties-line")) {
      map.setFilter("dynasties-line", filter);
    }
  }, [currentYear, dynastyLayersReady]);

  return <div className="history-map-canvas" ref={mapNodeRef} />;
}
