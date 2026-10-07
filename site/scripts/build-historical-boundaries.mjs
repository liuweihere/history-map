// 生成"按需叠加"的历史政权边界（public/data/historical/*.geojson）：
//   sanguo.geojson —— 三国鼎立：魏(北) / 蜀(西南) / 吴(东南)
//   chuhan.geojson —— 楚汉相争：西楚(项羽) / 汉(刘邦)
// 复用 build-watercolor-regions 的确定性水彩环算法（自然边界 + 防自交），
// 骨架锚点依史料大致疆域手工标定（儿童绘本精度：示意级，非考据级）。
//
// 用法: node scripts/build-historical-boundaries.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 政权边界专用：确定性水彩环（无随机）───────────────────────────
// 与 8 大区不同，政权必须互斥（一点只属一国）。做法：共享边的两国
// 用同一段几何计算中点（方向无关的确定性正弦曲率），边界完全重合，
// 零重叠零缝隙；同时保留自然曲折的手绘质感。
function canonicalPair(a, b) {
  return a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
}

function refineEdge(a, b) {
  const [p, q] = canonicalPair(a, b);
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = Math.min(0.1, len * 0.06);
  const phase = Math.sin(p[0] * 12.9898 + p[1] * 78.233);
  const wig = Math.sin(phase * 6.2832) * amp;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return [mid[0] + nx * wig, mid[1] + ny * wig];
}

function factionRing(skeleton) {
  const pts = [];
  const n = skeleton.length;
  for (let i = 0; i < n; i++) {
    const a = skeleton[i];
    const b = skeleton[(i + 1) % n];
    pts.push(a);
    pts.push(refineEdge(a, b));
  }
  pts.push(pts[0]);
  return pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);
}

// ── 三国（220-280 鼎立期，示意疆域）─────────────────────────────
// 魏蜀 / 魏吴 共享边界锚点（完全相同坐标）→ 确定性曲率后边界逐点重合。
// 魏：中原+华北+辽东+河西，都洛阳；蜀：巴蜀+汉中，都成都；
// 吴：长江中下游+岭南，都建业。
const W_SHU_NW = [103.0, 32.9]; // 魏蜀西端共享锚
const W_SHU_NE = [110.5, 32.2]; // 魏蜀东端共享锚
const W_WU_NW = [110.5, 32.2]; // 魏吴西端共享锚（= 魏蜀东端，三国交界）
const W_WU_NE = [118.5, 32.4]; // 魏吴东端共享锚（建业以北）

const SANGUO = [
  {
    id: "wei",
    name: "魏",
    color: "#E8D5A3",
    capital: "洛阳",
    skeleton: [
      [102.0, 40.8], [108.5, 41.0], [116.0, 41.2], [122.5, 40.5],
      [124.5, 39.0], [123.0, 37.0], [121.5, 35.0], [119.5, 33.5],
      W_WU_NE, [116.5, 30.9], [113.5, 31.0], W_WU_NW, [106.5, 33.5],
      W_SHU_NW, [102.0, 36.0], [101.5, 37.5],
    ],
  },
  {
    id: "shu",
    name: "蜀",
    color: "#BCD9C3",
    capital: "成都",
    skeleton: [
      W_SHU_NW, [106.5, 33.5], W_SHU_NE,
      [110.0, 30.5], [108.5, 29.0], [106.0, 27.5], [103.5, 27.8],
      [101.8, 29.5],
    ],
  },
  {
    id: "wu",
    name: "吴",
    color: "#B8CFE0",
    capital: "建业",
    skeleton: [
      W_WU_NW, [113.5, 31.0], [116.5, 30.9], W_WU_NE,
      [120.5, 31.5], [121.8, 30.0], [120.5, 28.0], [118.0, 26.0],
      [114.0, 22.8], [110.5, 21.8], [109.0, 24.0], [110.5, 28.0],
      [111.5, 30.0],
    ],
  },
];

// ── 楚汉相争（前206-前202，示意）───────────────────────────────
// 汉：关中+陇西+汉中+巴蜀（都南郑→长安）；西楚：梁楚九郡+江东
// （都彭城，含会稽——乌江/吴中是项羽根据地）。
// 赵国（邯郸）、齐国（临淄）等诸侯留白，正好讲"当时不止两家"。
const HC_N = [111.5, 34.1];
const HC_S = [111.0, 31.4];
const CHUHAN = [
  {
    id: "han",
    name: "汉",
    color: "#D9C8A8",
    capital: "长安",
    skeleton: [
      [101.5, 32.5], [102.0, 34.3], [104.5, 36.0], [107.5, 36.6],
      [110.5, 35.9], HC_N, HC_S, [108.5, 30.0], [106.5, 29.2],
      [103.5, 28.5], [101.8, 30.2],
    ],
  },
  {
    id: "chu",
    name: "西楚",
    color: "#E5C8B8",
    capital: "彭城",
    skeleton: [
      HC_N, [114.5, 35.6], [117.5, 35.9], [119.3, 34.8],
      [120.9, 34.2], [121.2, 32.5], [120.8, 31.0], [120.5, 30.0],
      [119.0, 29.8], [117.5, 30.2], [116.8, 30.6], [117.8, 31.5],
      [119.2, 32.0], [119.0, 33.2], [116.5, 32.0], [114.0, 31.8],
      HC_S,
    ],
  },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", "public", "data", "historical");
fs.mkdirSync(outDir, { recursive: true });

function writeCollection(fileName, factions) {
  const features = factions.map((f, i) => ({
    type: "Feature",
    id: i + 1,
    properties: {
      id: f.id,
      name: f.name,
      color: f.color,
      capital: f.capital,
      kind: "faction",
    },
    geometry: {
      type: "Polygon",
      coordinates: [factionRing(f.skeleton)],
    },
  }));
  const out = { type: "FeatureCollection", features };
  fs.writeFileSync(path.join(outDir, fileName), JSON.stringify(out, null, 2) + "\n");
  console.log(
    `wrote ${fileName}:`,
    features.map((f) => `${f.properties.name}(${f.geometry.coordinates[0].length - 1}pts)`).join(" "),
  );
}

writeCollection("sanguo.geojson", SANGUO);
writeCollection("chuhan.geojson", CHUHAN);
