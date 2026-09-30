"use client";

import { useEffect, useRef } from "react";

import {
  placeCoordinates,
  storyMapScenes,
} from "../lib/story-map-geo";

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

function markerKindForPlace(placeId, storyId, scene) {
  const configured = scene?.markerKindByPlaceId?.[placeId];
  if (configured) return configured;
  if (storyId === "story_000_xiang_yu_wujiang") {
    return placeId === "place_wujiang" ? "capital" : "uprising";
  }
  return placeId === "place_luoyang" ? "capital" : "uprising";
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
        const scene = storyMapScenes[story.story_id];
        if (!scene) {
          throw new Error(`No map scene configured for ${story.story_id}.`);
        }

        const chinaBackdropPromise = fetch("/data/static/china-base.geojson").then((response) => {
          if (!response.ok) {
            throw new Error("Failed to load china-base.geojson.");
          }

          return response.json();
        });

        map.fitBounds(scene.bounds, {
          padding: scene.fitPadding ?? { top: 80, right: 90, bottom: 80, left: 90 },
          duration: 0,
        });

        chinaBackdropPromise.then((chinaBackdrop) => {
          if (!mapRef.current) return;

          map.addSource("story001-overlay", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                ...chinaBackdrop.features,
                scene.features.heartland,
                scene.features.disturbance,
                scene.features.route,
              ],
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

          const placeMeta = story.places
            .map((place) => {
              const coordinate = placeCoordinates[place.id];
              if (!coordinate) return null;
              const subtitle = scene.markerSubtitleByPlaceId?.[place.id];
              if (!subtitle) return null;
              return { place, coordinate, subtitle };
            })
            .filter(Boolean);

          markersRef.current = placeMeta.map(({ place, coordinate, subtitle }) => {
            const kind = markerKindForPlace(place.id, story.story_id, scene);
            return new maplibregl.Marker({
              element: createMarkerNode(kind, coordinate.label, subtitle),
              anchor: "left",
            })
              .setLngLat([coordinate.lng, coordinate.lat])
              .addTo(map);
          });
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
