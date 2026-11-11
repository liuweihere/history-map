// 朝代带（dynasty bands）纯逻辑 —— 江山时序（jiangshan-map）上游时间轴
// 分段线性映射的对照移植（js/app.js _initTimelineBands / _yearToProgress /
// _progressToYear），在本站序号空间（无零年）上实现：
//
// - 每个朝代带宽权重 = max(实际序号跨度, MIN_SPAN=60)：短朝代保底可点读，
//   不做全量线性真值（上游同款取舍：2400 年压进一条轨道，秦/隋等短朝代
//   真按比例只剩几像素，无法点击）；
// - 朝代内按序号比例线性，朝代间按权重拼接（offset 累计归一）；
// - 边界年份属于后一个朝代（findBandIndex 从尾部找 yearOrd >= fromOrd）；
// - 序号空间天然无零年：progressToYearOrd 的任何返回值经 ordinalToYear
//   还原都不是公元 0 年（ord(-1)=0 → year -1，ord(1)=1 → year 1）。
//
// 本模块不依赖 DOM/React，供 dynasty-timeline.jsx 与测试共用。

import { yearToOrdinal } from "./jiangshan-time.js";

// 上游 minSpan = 60（_initTimelineBands）：短朝代带宽保底 60 年等效宽度。
export const BAND_MIN_SPAN = 60;

// 标签分级阈值（按带宽占比）：上游用实测像素宽度动态判定
// （_refreshBandLabels），本站用占比近似——在常见轨道宽度（≥900px）下
// 等效：占比 <3.5% ≈ <32px 放不下 12px 字号标签 → compact（10.5px）；
// <1.5% ≈ <14px → narrow（隐藏文字，保留色带可点）。
export const LABEL_COMPACT_FRAC = 0.035;
export const LABEL_NARROW_FRAC = 0.015;

/**
 * 由朝代列表构建带模型。
 * @param {array} dynasties  [{key,title,tint,from,to,phases?}]
 * @returns {{bands: array, totalWeight: number}}
 *   bands[i] = {key,title,tint,from,to,fromOrd,toOrd,weight,offset}
 */
export function buildBands(dynasties) {
  const bands = (Array.isArray(dynasties) ? dynasties : []).map((d) => {
    const fromOrd = yearToOrdinal(d.from);
    const toOrd = yearToOrdinal(d.to);
    return {
      key: d.key,
      title: d.title,
      tint: d.tint,
      from: d.from,
      to: d.to,
      fromOrd,
      toOrd,
      weight: Math.max(toOrd - fromOrd, BAND_MIN_SPAN),
    };
  });
  const totalWeight = bands.reduce((acc, b) => acc + b.weight, 0) || 1;
  let acc = 0;
  for (const b of bands) {
    b.offset = acc / totalWeight;
    acc += b.weight;
  }
  return { bands, totalWeight };
}

/**
 * 年份序号 → 所属带下标。边界年份属于后一个朝代（上游 _findDynastyIndex 语义）。
 */
export function findBandIndex(bands, yearOrd) {
  for (let i = bands.length - 1; i >= 0; i--) {
    if (yearOrd >= bands[i].fromOrd) return i;
  }
  return 0;
}

/**
 * 年份序号 → 轨道进度 0..1（分段线性：带内按序号比例）。
 */
export function yearToProgress(model, yearOrd) {
  const { bands, totalWeight } = model;
  if (!bands.length) return 0;
  const i = findBandIndex(bands, yearOrd);
  const b = bands[i];
  const span = Math.max(1, b.toOrd - b.fromOrd);
  const local = Math.min(1, Math.max(0, (yearOrd - b.fromOrd) / span));
  return b.offset + local * (b.weight / totalWeight);
}

/**
 * 轨道进度 0..1 → 年份序号（分段线性反解；越界钳制到首末带端点）。
 * 返回值是序号：经 ordinalToYear 还原永不为公元 0 年。
 */
export function progressToYearOrd(model, frac) {
  const { bands, totalWeight } = model;
  if (!bands.length) return 0;
  const clamped = Math.min(0.999999, Math.max(0, frac));
  let i = bands.length - 1;
  while (i > 0 && bands[i].offset > clamped) i--;
  const b = bands[i];
  const weightFrac = b.weight / totalWeight;
  if (!weightFrac) return b.fromOrd;
  const local = (clamped - b.offset) / weightFrac;
  return Math.round(b.fromOrd + local * (b.toOrd - b.fromOrd));
}

/**
 * 带标签分级："" | "is-compact" | "is-narrow"（上游实测像素判定的占比近似）。
 * @param {number} frac  带宽占比 weight/totalWeight
 */
export function bandLabelClass(frac) {
  if (frac < LABEL_NARROW_FRAC) return "is-narrow";
  if (frac < LABEL_COMPACT_FRAC) return "is-compact";
  return "";
}
