export const placeCoordinates = {
  place_luoyang: {
    lng: 112.453895,
    lat: 34.624523,
    label: "洛阳",
    subtitle: "Central Court",
  },
  place_julu: {
    lng: 114.92,
    lat: 37.22,
    label: "钜鹿",
    subtitle: "Uprising Focus",
  },
};

export const story001MapView = {
  bounds: [
    [108.2, 31.6],
    [119.8, 40.7],
  ],
};

export const story001MapOverlay = {
  heartland: {
    type: "Feature",
    properties: {
      id: "han-heartland",
      title: "Eastern Han Order Zone",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [108.9, 33.0],
        [110.4, 32.3],
        [113.6, 32.5],
        [116.8, 33.6],
        [118.2, 36.4],
        [117.4, 38.5],
        [114.7, 39.3],
        [111.3, 39.2],
        [109.0, 37.1],
        [108.3, 34.8],
        [108.9, 33.0],
      ]],
    },
  },
  disturbance: {
    type: "Feature",
    properties: {
      id: "yellow-turban-pressure",
      title: "Yellow Turban Disturbance",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [112.7, 35.8],
        [114.2, 35.6],
        [116.8, 36.0],
        [118.2, 37.8],
        [117.2, 39.3],
        [114.6, 39.9],
        [112.8, 38.6],
        [112.2, 37.1],
        [112.7, 35.8],
      ]],
    },
  },
  river: {
    type: "Feature",
    properties: {
      id: "yellow-river-axis",
      title: "Yellow River Axis",
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [109.0, 34.6],
        [110.8, 34.8],
        [112.2, 35.0],
        [113.5, 35.1],
        [115.0, 35.4],
        [116.4, 35.9],
        [118.1, 36.6],
      ],
    },
  },
};

