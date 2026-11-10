// Phase 3 · 时空探索时间逻辑（纯函数，无 React / fetch 依赖）。
//
// 设计依据 PLAN.md V3 §3「时间轴与历史语义」与 §5「时间与内容验收」：
// - 时间选择为任意有效整数年份（前 403 ~ 公元 1948），前 1 年之后是公元 1 年，无 0 年。
// - 公元前后转换使用无零年的连续序号：序号 = year>0 ? year : year+1；
//   于是 -1(序0) 与 1(序1) 相邻，序列连续且不含 0。
// - 标签仍展示历史年份（前403 / 220），序号仅用于比例刻度与前后切换。
// - selectedYear 与 resolvedPhaseId 独立：换年不必然换快照。
//
// 本模块由 test/jiangshan-time.test.mjs 覆盖边界年（-1↔1 无 0、-203/-202、
// 219/220、1948/1949）与阶段解析，使用真实组件所需同一函数。

export const JIANGSHAN_MIN_YEAR = -403;
export const JIANGSHAN_MAX_YEAR = 1948;

/**
 * 年份是否为有效选择：整数、非 0、落在导出覆盖区间 [MIN, MAX]。
 * 早于 MIN 或晚于 MAX 的年份不可选（不静默截断，UI 显式提示）。
 */
export function isValidYear(year) {
  return (
    Number.isInteger(year) &&
    year !== 0 &&
    year >= JIANGSHAN_MIN_YEAR &&
    year <= JIANGSHAN_MAX_YEAR
  );
}

/**
 * 无零年连续序号：用于比例刻度与前后切换的步进。
 * year>0 → year；year<0 → year+1（-1→0，-2→-1，-403→-402）。
 * year===0 视为非法，返回 null。
 */
export function yearToOrdinal(year) {
  if (!Number.isInteger(year) || year === 0) return null;
  return year > 0 ? year : year + 1;
}

/**
 * 序号 → 历史年份：ord>0 → ord；ord<=0 → ord-1（0→-1，-1→-2，1→1）。
 */
export function ordinalToYear(ord) {
  if (!Number.isInteger(ord)) return null;
  return ord > 0 ? ord : ord - 1;
}

/**
 * 下一年（跨零跳过 0）：-1 → 1；其余按序号 +1。
 * 超过 MAX 返回 null（UI 不越界）。
 */
export function nextYear(year) {
  const ord = yearToOrdinal(year);
  if (ord === null) return null;
  const ny = ordinalToYear(ord + 1);
  if (ny === null || ny > JIANGSHAN_MAX_YEAR) return null;
  return ny;
}

/**
 * 上一年（跨零跳过 0）：1 → -1；其余按序号 -1。
 * 低于 MIN 返回 null。
 */
export function prevYear(year) {
  const ord = yearToOrdinal(year);
  if (ord === null) return null;
  const py = ordinalToYear(ord - 1);
  if (py === null || py < JIANGSHAN_MIN_YEAR) return null;
  return py;
}

/**
 * 把任意输入钳制到合法区间，且永不产生 0 年。
 * 0 / null / undefined / 非整数 → 默认 MIN。
 */
export function clampYear(year) {
  if (!Number.isInteger(year) || year === 0) return JIANGSHAN_MIN_YEAR;
  if (year < JIANGSHAN_MIN_YEAR) return JIANGSHAN_MIN_YEAR;
  if (year > JIANGSHAN_MAX_YEAR) return JIANGSHAN_MAX_YEAR;
  return year;
}

/**
 * 历史年份显示标签：负数 →「前N」，正数 →「N」。
 */
export function formatYear(year) {
  if (!Number.isInteger(year)) return "";
  if (year < 0) return `前${Math.abs(year)}`;
  return String(year);
}

/**
 * 解析用户输入的年份字符串，支持「前403」「-403」「403」「公元220」等。
 * 返回整数年份或 null（非法）。不强制区间（由 isValidYear 判定）。
 */
export function parseYear(input) {
  if (typeof input === "number") {
    return Number.isInteger(input) ? input : null;
  }
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;
  // 「前403」/「公元前403」
  const bce = raw.match(/^(?:前|公元前|bce|BCE)\s*(-?\d+)$/);
  if (bce) {
    const n = parseInt(bce[1], 10);
    return Number.isFinite(n) ? -Math.abs(n) : null;
  }
  // 「公元220」/「ce」前缀
  const ce = raw.match(/^(?:公元|ce|CE)\s*(-?\d+)$/);
  if (ce) {
    const n = parseInt(ce[1], 10);
    return Number.isFinite(n) ? n : null;
  }
  // 纯数字（含负号）
  const num = parseInt(raw, 10);
  if (Number.isFinite(num) && String(num) === raw.replace(/\s/g, "")) {
    return num;
  }
  return null;
}
