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
          sources: {
            carto: {
              type: "raster",
              tiles: [
                "https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png",
                "https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png",
                "https://c.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png",
              ],
              tileSize: 256,
              attribution:
                '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/">CARTO</a>',
            },
          },
          layers: [
            {
              id: "carto-base",
              type: "raster",
              source: "carto",
              paint: {
                "raster-opacity": 0.94,
                "raster-saturation": -0.32,
                "raster-contrast": 0.04,
              },
            },
          ],
        },
        center: [113.5, 36.2],
        zoom: 5.1,
        minZoom: 4.2,
        maxZoom: 7.2,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });

      mapRef.current = map;

      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
        }),
        "bottom-left",
      );

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
            filter: ["==", ["get", "id"], "han-heartland"],
            paint: {
              "fill-color": "#ceb588",
              "fill-opacity": 0.18,
            },
          });

          map.addLayer({
            id: "han-heartland-outline",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "id"], "han-heartland"],
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
            filter: ["==", ["get", "id"], "yellow-turban-pressure"],
            paint: {
              "fill-color": "#a07533",
              "fill-opacity": 0.16,
            },
          });

          map.addLayer({
            id: "yellow-turban-disturbance-outline",
            type: "line",
            source: "story001-overlay",
            filter: ["==", ["get", "id"], "yellow-turban-pressure"],
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
            filter: ["==", ["get", "id"], "yellow-river-axis"],
            paint: {
              "line-color": "#597487",
              "line-width": 2.3,
              "line-opacity": 0.62,
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
            const kind = place.id === "place_luoyang" ? "capital" : "uprising";
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
