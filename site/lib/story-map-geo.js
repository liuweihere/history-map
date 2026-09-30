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
  place_luoyang_eastern_han: {
    lng: 112.45,
    lat: 34.62,
    label: "洛阳",
    subtitle: "东汉都城",
  },
  place_tianzhu: {
    lng: 78.0,
    lat: 22.0,
    label: "天竺",
    subtitle: "求法起点",
  },
  place_nanyang: {
    lng: 112.53,
    lat: 32.99,
    label: "南阳",
    subtitle: "医圣故乡",
  },
  place_changsha: {
    lng: 112.94,
    lat: 28.23,
    label: "长沙",
    subtitle: "坐堂行医（相传）",
  },
  place_xuchang: {
    lng: 113.85,
    lat: 34.03,
    label: "许都",
    subtitle: "煮酒之地",
  },
};

const CHINA_PANORAMA_BOUNDS = [
  [78.0, 15.5],
  [132.0, 44.5],
];

function heartlandFeature(coordinates, title = "Story Heartland") {
  return {
    type: "Feature",
    properties: { id: "story-heartland", kind: "heartland", title },
    geometry: { type: "Polygon", coordinates },
  };
}

function disturbanceFeature(coordinates, title = "Disturbance Zone") {
  return {
    type: "Feature",
    properties: { id: "story-disturbance", kind: "disturbance", title },
    geometry: { type: "Polygon", coordinates },
  };
}

function routeFeature(geometry, title = "Story Route") {
  return {
    type: "Feature",
    properties: { id: "story-route", kind: "route", title },
    geometry,
  };
}

// 东汉核心疆域（示意）：北起幽燕，南至交趾北缘，西抵陇西，东到大海。
const EASTERN_HAN_HEARTLAND = [[
  [103.8, 34.6],
  [106.2, 38.4],
  [110.8, 40.6],
  [116.4, 40.9],
  [121.6, 39.4],
  [122.4, 36.8],
  [121.2, 31.6],
  [118.6, 26.4],
  [112.4, 24.2],
  [108.2, 21.6],
  [104.6, 23.2],
  [102.6, 27.4],
  [101.8, 31.6],
  [103.8, 34.6],
]];

export const storyMapScenes = {
  story_000_xiang_yu_wujiang: {
    bounds: CHINA_PANORAMA_BOUNDS,
    fitPadding: { top: 52, right: 56, bottom: 52, left: 56 },
    features: {
      heartland: heartlandFeature([[
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
      ]], "Chu Han Contest Zone"),
      disturbance: disturbanceFeature([[
        [115.1, 33.7],
        [117.5, 33.8],
        [119.2, 33.2],
        [119.7, 32.0],
        [119.0, 31.1],
        [117.4, 30.9],
        [115.8, 31.4],
        [114.9, 32.5],
        [115.1, 33.7],
      ]], "Retreat Pressure"),
      route: routeFeature({
        type: "LineString",
        coordinates: [
          [117.354, 33.008],
          [117.58, 32.76],
          [117.92, 32.49],
          [118.18, 32.2],
          [118.497, 31.727],
        ],
      }, "Gaixia To Wujiang Retreat"),
    },
    markerSubtitleByPlaceId: {
      place_gaixia: placeCoordinates.place_gaixia.subtitle202Bce,
      place_wujiang: placeCoordinates.place_wujiang.subtitle202Bce,
    },
    markerKindByPlaceId: {
      place_gaixia: "uprising",
      place_wujiang: "capital",
    },
  },

  story_001_cai_lun_zao_zhi: {
    bounds: CHINA_PANORAMA_BOUNDS,
    fitPadding: { top: 52, right: 56, bottom: 52, left: 56 },
    features: {
      heartland: heartlandFeature(EASTERN_HAN_HEARTLAND, "Eastern Han Realm"),
      disturbance: disturbanceFeature([[
        [110.6, 33.2],
        [114.8, 33.9],
        [115.6, 35.8],
        [112.6, 36.4],
        [110.2, 35.2],
        [110.6, 33.2],
      ]], "Where Paper Was Perfected"),
      route: routeFeature({
        type: "MultiLineString",
        coordinates: [
          [
            [112.45, 34.62],
            [119.6, 35.4],
            [124.8, 39.6],
            [127.4, 40.4],
          ],
          [
            [112.45, 34.62],
            [106.2, 35.6],
            [98.4, 38.6],
            [88.2, 41.4],
            [80.6, 42.8],
          ],
        ],
      }, "Paper Spreads From Luoyang"),
    },
    markerSubtitleByPlaceId: {
      place_luoyang_eastern_han: "发明诞生地 · 蔡侯纸",
    },
    markerKindByPlaceId: {
      place_luoyang_eastern_han: "capital",
    },
  },

  story_002_han_ming_di_qiu_fa: {
    bounds: CHINA_PANORAMA_BOUNDS,
    fitPadding: { top: 52, right: 56, bottom: 52, left: 56 },
    features: {
      heartland: heartlandFeature(EASTERN_HAN_HEARTLAND, "Eastern Han Realm"),
      disturbance: disturbanceFeature([[
        [90.2, 34.4],
        [100.6, 36.8],
        [104.2, 33.4],
        [97.4, 30.8],
        [90.8, 31.2],
        [90.2, 34.4],
      ]], "Western Regions Corridor"),
      route: routeFeature({
        type: "LineString",
        coordinates: [
          [78.0, 22.0],
          [82.4, 26.8],
          [88.6, 32.4],
          [95.2, 35.8],
          [102.4, 36.4],
          [108.2, 35.2],
          [112.45, 34.62],
        ],
      }, "White Horse Sutra Route"),
    },
    markerSubtitleByPlaceId: {
      place_tianzhu: "求法起点 · 高僧东来",
      place_luoyang_eastern_han: "白马寺 · 故事落点",
    },
    markerKindByPlaceId: {
      place_tianzhu: "uprising",
      place_luoyang_eastern_han: "capital",
    },
  },

  story_003_zhang_zhong_jing: {
    bounds: CHINA_PANORAMA_BOUNDS,
    fitPadding: { top: 52, right: 56, bottom: 52, left: 56 },
    features: {
      heartland: heartlandFeature(EASTERN_HAN_HEARTLAND, "Eastern Han Realm"),
      disturbance: disturbanceFeature([[
        [108.6, 30.4],
        [115.2, 31.2],
        [117.8, 34.6],
        [114.2, 37.8],
        [109.2, 36.4],
        [108.6, 30.4],
      ]], "Plague Stricken Central Plains"),
      route: routeFeature({
        type: "LineString",
        coordinates: [
          [112.53, 32.99],
          [112.68, 31.4],
          [112.94, 28.23],
        ],
      }, "Nanyang To Changsha"),
    },
    markerSubtitleByPlaceId: {
      place_nanyang: "医圣故乡",
      place_changsha: "坐堂行医（相传）",
    },
    markerKindByPlaceId: {
      place_nanyang: "capital",
      place_changsha: "uprising",
    },
  },

  story_004_zhu_jiu_lun_ying_xiong: {
    bounds: CHINA_PANORAMA_BOUNDS,
    fitPadding: { top: 52, right: 56, bottom: 52, left: 56 },
    features: {
      heartland: heartlandFeature([[
        [104.6, 33.8],
        [108.4, 37.6],
        [113.6, 39.4],
        [118.8, 38.6],
        [121.4, 35.2],
        [119.6, 32.4],
        [115.8, 31.2],
        [111.2, 31.4],
        [106.8, 32.2],
        [104.6, 33.8],
      ]], "Cao Cao Controlled Zone"),
      disturbance: disturbanceFeature([[
        [112.6, 33.2],
        [115.6, 33.8],
        [116.2, 35.4],
        [113.4, 36.2],
        [111.8, 34.8],
        [112.6, 33.2],
      ]], "Xudu Power Center"),
      route: routeFeature({
        type: "LineString",
        coordinates: [
          [113.85, 34.03],
          [114.6, 34.4],
          [115.8, 34.8],
        ],
      }, "Liu Bei's Hidden Ambition"),
    },
    markerSubtitleByPlaceId: {
      place_xuchang: "青梅煮酒 · 小亭论英雄",
    },
    markerKindByPlaceId: {
      place_xuchang: "capital",
    },
  },
};
