// 生成"自然水彩晕染版图" regions.geojson：
// 1. 每区 Polygon 顶点 15~25 个：沿骨架插值 + 地形化的微小曲折
//    （曲折幅度按边界走向调制，模拟山脉/河流的有机延伸，避免平直几何线）；
// 2. 覆盖范围外扩：邻近大区自然贴合，消除中间苍白缝隙；
// 3. 输出为确定性伪随机（种子固定），可重复构建。
//
// 用法: node scripts/build-watercolor-regions.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 种子伪随机（mulberry32）：固定种子 → 输出稳定可复现 ──────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261007);

// 地形调制：不同边界段给不同"曲折能量"（度）。
// 数值小 = 平缓（海岸/平原），数值大 = 蜿蜒（山地/河谷）。
// 顺序对应 skeleton 段（顺时针）。
function jitterFor(regionId, segIndex, totalSegs) {
  // 基础能量 0.12°~0.4°，随段与区微变
  const base = 0.12 + rnd() * 0.22;
  // 山地边界更蜿蜒：关中周边(秦岭/黄土高原)、巴蜀边缘(山脉)、河西走廊两侧
  const mountainous = {
    guanzhong: 1.5,
    bashu: 1.7,
    hexi: 1.4,
    jingchu: 1.15,
    zhongyuan: 0.9,
    jiangnan: 1.0,
    qilu: 0.8,
    yanzhao: 1.0,
  }[regionId] ?? 1;
  const wave = 0.75 + 0.5 * Math.sin(segIndex * 2.4 + totalSegs);
  return base * mountainous * wave;
}

// 在两点之间按地形能量插入曲折中点（模拟山脊/河曲的有机抖动）
function refineSegment(a, b, energy) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // 垂直于边界方向偏移 → 制造自然曲折；偏移不超过段长的 18%，避免自交
  const offset = (rnd() * 2 - 1) * Math.min(energy, len * 0.18);
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  return [mid[0] + nx * offset, mid[1] + ny * offset];
}

// 骨架 → 水彩多边形：先整体外扩(outward°)，再逐段插值曲折点
function watercolorRing(skeleton, regionId, outward) {
  const pts = [];
  const n = skeleton.length;
  for (let i = 0; i < n; i++) {
    const a = skeleton[i];
    const b = skeleton[(i + 1) % n];
    // 骨架点本身沿"离开质心"方向轻微外扩，消除邻区间缝隙
    pts.push(a);
    // 每段插入 2 个曲折点（骨架 7~9 点 → 21~27 顶点，符合 15~25 要求的近似带宽）
    pts.push(refineSegment(a, b, jitterFor(regionId, i, n)));
    pts.push(refineSegment(b, a, jitterFor(regionId, i + 1, n)));
  }
  // 外扩：以环质心为原点，向外推 outward 度
  const centroid = pts.reduce(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1]],
    [0, 0],
  ).map((v) => v / pts.length);
  const expanded = pts.map(([x, y]) => {
    const d = Math.hypot(x - centroid[0], y - centroid[1]) || 1;
    return [
      +(x + ((x - centroid[0]) / d) * outward).toFixed(4),
      +(y + ((y - centroid[1]) / d) * outward).toFixed(4),
    ];
  });
  // 闭合环
  expanded.push(expanded[0]);
  return expanded;
}

// ── 8 大区骨架（外扩前，每区 8 点 → 水彩环 24 顶点）────────────────
// 依据 plan.md 八大区定义 + 中国自然地理（关中盆地、华北平原、长江中下游、
// 四川盆地、燕山-太行、江汉-洞庭、山东丘陵、祁连山北麓走廊）。
const REGION_SKELETONS = {
  // 关中：渭河平原 + 陕北黄土高原南缘，东至潼关接中原
  guanzhong: [
    [105.8, 34.9], [107.5, 35.8], [109.2, 35.6], [110.6, 35.2],
    [110.7, 34.4], [109.6, 33.9], [108.2, 33.7], [106.2, 33.8],
  ],
  // 中原：华北平原南部，北缘抬至 ~35.4 与燕赵自然贴合
  zhongyuan: [
    [110.9, 34.2], [112.8, 35.1], [114.8, 35.5], [116.8, 34.9],
    [117.7, 33.4], [116.6, 32.2], [113.5, 32.4], [111.0, 32.9],
  ],
  // 江南：长江以南太湖-钱塘江-徽州丘陵；西北角覆盖南京（江东之地）
  jiangnan: [
    [117.9, 32.6], [119.8, 31.6], [121.4, 31.0], [122.2, 30.2],
    [121.0, 29.2], [119.4, 28.9], [117.8, 29.5], [117.0, 30.8],
  ],
  // 巴蜀：四川盆地，西缘龙门山-邛崃山，东至三峡接荆楚
  bashu: [
    [102.8, 31.6], [104.8, 32.4], [106.6, 32.2], [108.2, 31.4],
    [108.0, 30.0], [107.0, 28.9], [105.3, 28.4], [103.2, 30.0],
  ],
  // 燕赵：燕山以南、太行以东的河北平原 + 北京；东南角内收让出济南盆地
  yanzhao: [
    [113.9, 39.6], [116.0, 40.2], [117.6, 40.0], [118.9, 39.2],
    [119.2, 37.6], [116.4, 36.8], [114.4, 36.2], [113.9, 38.0],
  ],
  // 荆楚：江汉平原+洞庭湖平原，两湖地区
  jingchu: [
    [108.4, 31.0], [110.6, 31.6], [112.6, 31.4], [114.2, 30.6],
    [114.0, 29.0], [112.6, 28.2], [110.8, 28.6], [108.8, 29.6],
  ],
  // 齐鲁：山东丘陵+半岛，北至渤海海岸
  qilu: [
    [116.2, 37.6], [118.2, 38.2], [120.2, 38.1], [122.4, 37.4],
    [122.6, 36.7], [120.8, 36.0], [118.6, 35.4], [116.6, 36.4],
  ],
  // 河西走廊：祁连山北麓东西向走廊，西端至敦煌，东南端覆盖武威
  hexi: [
    [93.8, 40.7], [96.6, 40.8], [99.6, 40.5], [102.2, 40.1],
    [104.2, 39.7], [104.5, 38.7], [103.2, 37.5], [94.9, 39.9],
  ],
};

// 每区外扩度数（让邻区贴合）：燕赵/齐鲁收窄避免相互叠压
const OUTWARD = {
  guanzhong: 0.28,
  zhongyuan: 0.28,
  jiangnan: 0.3,
  bashu: 0.26,
  yanzhao: 0.22,
  jingchu: 0.3,
  qilu: 0.24,
  hexi: 0.22,
};

// 马卡龙水彩色板（2026-10-07 视觉全面对齐）：低饱和复古，互不相同
const MACARON_PALETTE = {
  guanzhong: "#EDE0C8", // 关中 · 淡禾黄
  zhongyuan: "#F7D2C4", // 中原 · 淡珊瑚橘
  jingchu: "#CBE3D5", // 荆楚 · 淡水绿
  jiangnan: "#D9E2F3", // 江南 · 淡浅蓝紫
  bashu: "#E2D8E8", // 巴蜀 · 淡丁香紫
  yanzhao: "#D8E3D8", // 燕赵 · 淡鼠尾草绿
  qilu: "#FCE8D5", // 齐鲁 · 淡奶杏
  hexi: "#E5E0CE", // 河西走廊 · 淡灰金
};

// 保留原文件属性（名称/色板/label_position/focus_zoom）
const here = path.dirname(fileURLToPath(import.meta.url));
const defaultIn = path.join(here, "..", "public", "data", "static", "regions.geojson");
const original = JSON.parse(
  fs.readFileSync(path.resolve(process.argv[2] ?? defaultIn), "utf8"),
);
const META = Object.fromEntries(
  original.features.map((f) => [f.properties.id, f.properties]),
);

const featureList = Object.entries(REGION_SKELETONS).map(([id, skeleton]) => {
  const ring = watercolorRing(skeleton, id, OUTWARD[id]);
  return {
    type: "Feature",
    properties: { ...META[id], color: MACARON_PALETTE[id] },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
});

// ── 写出（feature id 保留 1..8 用于 feature-state 高亮）────────────
const out = {
  type: "FeatureCollection",
  features: featureList.map((f, i) => ({ id: i + 1, ...f })),
};
const outPath = path.resolve(process.argv[3] ?? defaultIn);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(
  `wrote ${outPath}: ${out.features.length} regions, ` +
    out.features
      .map((f) => `${f.properties.id}(${f.geometry.coordinates[0].length - 1}pts)`)
      .join(" "),
);
