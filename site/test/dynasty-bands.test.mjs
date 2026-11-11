// 朝代带（dynasty bands）纯逻辑测试 —— 江山时序上游实现的对照移植。
//
// 上游语义（jiangshan-map js/app.js _initTimelineBands / _yearToProgress /
// _progressToYear）：
// - 每个朝代带宽 = max(实际年跨, minSpan=60)，短朝代保底可点；
// - 分段线性映射：朝代内按年份比例，朝代间按带宽权重；
// - 边界年份属于后一个朝代（如 -202 → 西汉）；
// - 无零年：拖动取年永远不产出公元 0 年（本站用序号空间天然规避）。
//
// 运行：npm test（tsx loader）

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BAND_MIN_SPAN,
  buildBands,
  findBandIndex,
  yearToProgress,
  progressToYearOrd,
  bandLabelClass,
} from "../lib/dynasty-bands.js";
import { yearToOrdinal, ordinalToYear } from "../lib/jiangshan-time.js";

const DYNASTIES = [
  { key: "zhanguo", title: "战国", tint: "#7c5338", from: -403, to: -222 },
  { key: "qin", title: "秦", tint: "#5a554f", from: -221, to: -203 },
  { key: "xihan", title: "西汉", tint: "#b5452f", from: -202, to: 24 },
  { key: "donghan", title: "东汉", tint: "#a4432c", from: 25, to: 219 },
];

test("buildBands：短朝代带宽保底 minSpan=60（上游 minSpan 语义）", () => {
  const { bands } = buildBands(DYNASTIES);
  const qin = bands.find((b) => b.key === "qin");
  // 秦实际跨度：ord(-203)-ord(-220)... from=-221→ord -220, to=-203→ord -202，跨 18 → 保底 60
  assert.equal(qin.weight, BAND_MIN_SPAN);
  // 长朝代按实际年跨：西汉 ord(-201)..ord(24) = 225
  const xihan = bands.find((b) => b.key === "xihan");
  assert.equal(xihan.weight, 225);
});

test("buildBands：offset 累计归一、携带 tint/title 供 band-cell 渲染", () => {
  const { bands, totalWeight } = buildBands(DYNASTIES);
  assert.equal(totalWeight, 181 + 60 + 225 + 194);
  let acc = 0;
  for (const b of bands) {
    assert.ok(Math.abs(b.offset - acc / totalWeight) < 1e-12, `${b.key} offset 应累计归一`);
    acc += b.weight;
    assert.ok(b.tint.startsWith("#"), "携带 tint（上游 cell.style.background = d.tint）");
    assert.ok(b.title, "携带朝代名");
  }
});

test("findBandIndex：边界年份属于后一个朝代（-202 → 西汉，非秦）", () => {
  const { bands } = buildBands(DYNASTIES);
  assert.equal(bands[findBandIndex(bands, yearToOrdinal(-203))].key, "qin");
  assert.equal(bands[findBandIndex(bands, yearToOrdinal(-202))].key, "xihan");
  assert.equal(bands[findBandIndex(bands, yearToOrdinal(-403))].key, "zhanguo");
  assert.equal(bands[findBandIndex(bands, yearToOrdinal(219))].key, "donghan");
});

test("yearToProgress：朝代起止精确映射到带边界", () => {
  const model = buildBands(DYNASTIES);
  const { bands, totalWeight } = model;
  for (const b of bands) {
    const pStart = yearToProgress(model, b.fromOrd);
    const pEnd = yearToProgress(model, b.toOrd);
    assert.ok(Math.abs(pStart - b.offset) < 1e-9, `${b.key} 起点应在带左缘`);
    assert.ok(Math.abs(pEnd - (b.offset + b.weight / totalWeight)) < 1e-9, `${b.key} 终点应在带右缘`);
  }
});

test("progressToYearOrd：与 yearToProgress 在朝代边界互逆", () => {
  const model = buildBands(DYNASTIES);
  for (const b of model.bands) {
    assert.equal(progressToYearOrd(model, b.offset), b.fromOrd, `${b.key} 带左缘 → from`);
    assert.equal(
      progressToYearOrd(model, b.offset + b.weight / model.totalWeight - 1e-9),
      b.toOrd,
      `${b.key} 带右缘内侧 → to`,
    );
  }
});

test("progressToYearOrd：拖动跨越零年区间永不产出公元 0 年", () => {
  const model = buildBands(DYNASTIES);
  // 西汉带跨越 -1/1（无零年）：在带内密采 500 点（开区间——右缝按上游语义
  // 属于东汉起点 25，与「边界归后朝」一致），全部应还原为合法非零年份
  const xihan = model.bands.find((b) => b.key === "xihan");
  const wFrac = xihan.weight / model.totalWeight;
  for (let i = 0; i < 500; i++) {
    const frac = xihan.offset + (i / 500) * wFrac;
    const year = ordinalToYear(progressToYearOrd(model, frac));
    assert.notEqual(year, 0, `frac=${frac} 不得产出公元 0 年`);
    assert.ok(year >= -202 && year <= 24, `应落在西汉区间内，实际 ${year}`);
  }
  // 右缝边界点 → 下一朝代起点（与 findBandIndex 边界语义自洽）
  assert.equal(ordinalToYear(progressToYearOrd(model, xihan.offset + wFrac)), 25);
});

test("progressToYearOrd：frac 越界钳制到首末朝代端点", () => {
  const model = buildBands(DYNASTIES);
  assert.equal(progressToYearOrd(model, -0.5), model.bands[0].fromOrd);
  assert.equal(ordinalToYear(progressToYearOrd(model, 1.5)), 219);
});

test("bandLabelClass：按带宽占比分级（上游 is-compact / is-narrow 的近似）", () => {
  assert.equal(bandLabelClass(0.1), "");
  assert.equal(bandLabelClass(0.03), "is-compact");
  assert.equal(bandLabelClass(0.01), "is-narrow");
});
