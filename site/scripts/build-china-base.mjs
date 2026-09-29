import fs from "node:fs";
import path from "node:path";

const [inputPath, outputPath, toleranceArg] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/build-china-base.mjs <input-geojson> <output-geojson> [tolerance]");
  process.exit(1);
}

const tolerance = Number(toleranceArg ?? "0.08");
const sqTolerance = tolerance * tolerance;

function getSqDist(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function getSqSegDist(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);

    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;

  return dx * dx + dy * dy;
}

function simplifyDPStep(points, first, last, sqTol, kept) {
  let maxSqDist = sqTol;
  let index = -1;

  for (let i = first + 1; i < last; i += 1) {
    const sqDist = getSqSegDist(points[i], points[first], points[last]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }

  if (index !== -1) {
    if (index - first > 1) simplifyDPStep(points, first, index, sqTol, kept);
    kept.push(points[index]);
    if (last - index > 1) simplifyDPStep(points, index, last, sqTol, kept);
  }
}

function simplifyRing(points, sqTol) {
  if (points.length <= 4) return points;

  const closed = points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1];
  const ring = closed ? points.slice(0, -1) : points.slice();

  if (ring.length <= 3) return points;

  const kept = [ring[0]];
  simplifyDPStep(ring, 0, ring.length - 1, sqTol, kept);
  kept.push(ring[ring.length - 1]);

  kept.sort((a, b) => ring.indexOf(a) - ring.indexOf(b));

  const deduped = [];
  for (const point of kept) {
    const prev = deduped.at(-1);
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) {
      deduped.push(point);
    }
  }

  while (deduped.length < 4) {
    deduped.splice(deduped.length - 1, 0, ring[Math.max(1, ring.length - (5 - deduped.length))]);
  }

  deduped.push(deduped[0]);
  return deduped;
}

function polygonArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const feature = raw.features[0];
const polygons = feature.geometry.coordinates
  .map((polygon) => polygon.map((ring) => simplifyRing(ring, sqTolerance)))
  .filter((polygon) => polygonArea(polygon[0]) > 0.2);

const output = {
  type: "FeatureCollection",
  name: "china-base",
  features: [
    {
      type: "Feature",
      properties: {
        id: "china-backdrop",
        title: "Chinese Geographic Silhouette",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: polygons,
      },
    },
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output));

const rawPoints = feature.geometry.coordinates.reduce(
  (sum, polygon) => sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0),
  0,
);
const simplifiedPoints = polygons.reduce(
  (sum, polygon) => sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0),
  0,
);

console.log(
  `Wrote ${outputPath} with ${polygons.length} polygon(s); points ${rawPoints} -> ${simplifiedPoints}; tolerance ${tolerance}`,
);
