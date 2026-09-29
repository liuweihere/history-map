export const placeCoordinates = {
  place_gaixia: {
    lng: 117.354,
    lat: 33.008,
    label: "垓下",
    subtitle202Bce: "被围困之地",
  },
  place_wujiang: {
    lng: 118.497,
    lat: 31.727,
    label: "乌江",
    subtitle202Bce: "最后选择点",
  },
};

export const storyMapScenes = {
  story_000_xiang_yu_wujiang: {
    bounds: [
      [102.0, 24.8],
      [124.5, 38.8],
    ],
    fitPadding: { top: 52, right: 56, bottom: 52, left: 56 },
    features: {
      heartland: {
        type: "Feature",
        properties: { id: "han-heartland", title: "Chu Han Contest Zone" },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [107.4, 36.2],
            [111.2, 37.4],
            [116.3, 37.2],
            [120.3, 35.4],
            [121.7, 32.8],
            [120.2, 30.3],
            [116.4, 29.2],
            [111.1, 29.8],
            [107.8, 31.7],
            [106.6, 34.1],
            [107.4, 36.2],
          ]],
        },
      },
      disturbance: {
        type: "Feature",
        properties: { id: "retreat-pressure", title: "Retreat Pressure" },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [115.1, 33.7],
            [117.5, 33.8],
            [119.2, 33.2],
            [119.7, 32.0],
            [119.0, 31.1],
            [117.4, 30.9],
            [115.8, 31.4],
            [114.9, 32.5],
            [115.1, 33.7],
          ]],
        },
      },
      route: {
        type: "Feature",
        properties: { id: "gaixia-to-wujiang", title: "Gaixia To Wujiang Retreat" },
        geometry: {
          type: "LineString",
          coordinates: [
            [117.354, 33.008],
            [117.58, 32.76],
            [117.92, 32.49],
            [118.18, 32.2],
            [118.497, 31.727],
          ],
        },
      },
    },
    markerSubtitleByPlaceId: {
      place_gaixia: placeCoordinates.place_gaixia.subtitle202Bce,
      place_wujiang: placeCoordinates.place_wujiang.subtitle202Bce,
    },
  },
};
