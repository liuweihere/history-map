"use client";

import { useEffect, useRef } from "react";

function createMarkerNode(kind, label, subtitle) {
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
  labelBox.innerHTML = `<strong>${label}</strong><em>${subtitle}</em>`;

  anchor.append(halo, dot, sigil);
  wrapper.append(anchor, labelBox);
  return wrapper;
}

export function HistoryMapStage({ story }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

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
                "background-color": "#efe3cf",
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

        chinaBackdropPromise.then((chinaBackdrop) => {
          if (!mapRef.current) return;

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
              "fill-color": "#ead7af",
              "fill-opacity": 0.14,
            },
          });

          map.addLayer({
            id: "china-backdrop-shadow",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "id"], "china-backdrop"],
            paint: {
              "line-color": "rgba(79, 54, 24, 0.18)",
              "line-width": 6,
              "line-blur": 2,
              "line-opacity": 0.48,
            },
          });

          map.addLayer({
            id: "china-backdrop-outline",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "id"], "china-backdrop"],
            paint: {
              "line-color": "rgba(111, 81, 42, 0.86)",
              "line-width": 2.4,
              "line-opacity": 0.94,
            },
          });

          map.addLayer({
            id: "han-heartland-fill",
            type: "fill",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "heartland"],
            paint: {
              "fill-color": "#ceb588",
              "fill-opacity": 0.18,
            },
          });

          map.addLayer({
            id: "han-heartland-outline",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "heartland"],
            paint: {
              "line-color": "rgba(146, 116, 64, 0.64)",
              "line-width": 1.6,
              "line-opacity": 0.78,
            },
          });

          map.addLayer({
            id: "yellow-turban-disturbance-fill",
            type: "fill",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "disturbance"],
            paint: {
              "fill-color": "#a07533",
              "fill-opacity": 0.16,
            },
          });

          map.addLayer({
            id: "yellow-turban-disturbance-outline",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "kind"], "disturbance"],
            paint: {
              "line-color": "rgba(160, 117, 51, 0.72)",
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
              "line-color": "#597487",
              "line-width": 2.3,
              "line-opacity": 0.62,
              "line-dasharray": [2.5, 1.8],
            },
          });

          const placeById = new Map(story.places.map((place) => [place.id, place]));

          markersRef.current = (scene.markers ?? [])
            .map((marker) => {
              const place = placeById.get(marker.place_id);
              if (!place) return null;
              return new maplibregl.Marker({
                element: createMarkerNode(marker.kind, place.map_label, marker.subtitle),
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
    };
  }, [story]);

  return <div className="history-map-canvas" ref={mapNodeRef} />;
}
