"use client";

import { useEffect, useRef } from "react";

import {
  placeCoordinates,
  story001MapOverlay,
  story001MapView,
} from "../lib/story-map-geo";

function createMarkerNode(kind, label, subtitle) {
  const wrapper = document.createElement("div");
  wrapper.className = `map-marker map-marker--${kind}`;

  const dot = document.createElement("span");
  dot.className = "map-marker__dot";

  const labelBox = document.createElement("span");
  labelBox.className = "map-marker__label";
  labelBox.innerHTML = `<strong>${label}</strong><em>${subtitle}</em>`;

  wrapper.append(dot, labelBox);
  return wrapper;
}

function buildOverlayCollection() {
  return {
    type: "FeatureCollection",
    features: [
      story001MapOverlay.heartland,
      story001MapOverlay.disturbance,
      story001MapOverlay.river,
    ],
  };
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
                "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
                "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
                "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
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
                "raster-opacity": 0.9,
                "raster-saturation": -1,
                "raster-contrast": 0.15,
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
        map.fitBounds(story001MapView.bounds, {
          padding: { top: 80, right: 90, bottom: 80, left: 90 },
          duration: 0,
        });

        map.addSource("story001-overlay", {
          type: "geojson",
          data: buildOverlayCollection(),
        });

        map.addLayer({
          id: "han-heartland-fill",
          type: "fill",
          source: "story001-overlay",
          filter: ["==", ["get", "id"], "han-heartland"],
          paint: {
            "fill-color": "#ceb588",
            "fill-opacity": 0.22,
          },
        });

        map.addLayer({
          id: "yellow-turban-disturbance-fill",
          type: "fill",
          source: "story001-overlay",
          filter: ["==", ["get", "id"], "yellow-turban-pressure"],
          paint: {
            "fill-color": "#a07533",
            "fill-opacity": 0.24,
          },
        });

        map.addLayer({
          id: "yellow-river-axis-line",
          type: "line",
          source: "story001-overlay",
          filter: ["==", ["get", "id"], "yellow-river-axis"],
          paint: {
            "line-color": "#597487",
            "line-width": 3.5,
            "line-opacity": 0.78,
          },
        });

        const placeMeta = story.places
          .map((place) => {
            const coordinate = placeCoordinates[place.id];
            if (!coordinate) return null;
            return { place, coordinate };
          })
          .filter(Boolean);

        markersRef.current = placeMeta.map(({ place, coordinate }) => {
          const kind = place.id === "place_luoyang" ? "capital" : "uprising";
          return new maplibregl.Marker({
            element: createMarkerNode(kind, coordinate.label, coordinate.subtitle),
            anchor: "left",
          })
            .setLngLat([coordinate.lng, coordinate.lat])
            .addTo(map);
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

