// Phase 3 · 江山时序数据读取与解析（client-side）。
//
// 设计依据 PLAN.md V3 §2–3、§5：
// - 适配器预期数据位于 /data/jiangshan/：index.json、snapshots/<id>.geojson、
//   corridors.geojson、milestones.geojson。index 形如
//   { dynasties: [{ key,title,from,to, phases:[{snapshot,from,to,file,overview}] }] }。
// - 政权快照为 FeatureCollection，polity feature properties 含
//   title / tint / anchor（上游原始 tint 保留），适配器额外注入 display_color
//   （确定性本站粉彩）。渲染优先 display_color，回退 tint，再回退安全色。
// - corridors.geojson feature properties 含 from / to（两端包含，§3）。
//   注意：corridors 没有 from/to（span）时表示上游定义为「一直显示」，
//   不视为非法，按始终活跃处理。
// - milestones.geojson feature properties 含 dynasty / year / headline / site
//   （site 为地点名称字符串，非坐标）；坐标在 feature.geometry（Point）。
//   适配器额外注入 source_key（仅版本内来源键，禁止自动故事关联）。
// - 事件 → 故事仅经审定桥接表（story-bridge.json，可选，wiki 维护）；
//   缺失/未批准按空表运行（无金点，功能完整且诚实）。
//
// 可靠性（§5 地图与状态验收）：
// - fetch 响应检查失败 → 明确退化，不展示过期地图；
// - 快速切换的旧请求用 AbortController 取消，不覆盖新选择；
// - 同 phase 不重复加载（snapshot 缓存按 phase 标识键）。

import {
  JIANGSHAN_MIN_YEAR,
  JIANGSHAN_MAX_YEAR,
  isValidYear,
} from "./jiangshan-time.js";

export const JIANGSHAN_DATA_BASE = "/data/jiangshan";
export const JIANGSHAN_INDEX_URL = `${JIANGSHAN_DATA_BASE}/index.json`;
export const JIANGSHAN_CORRIDORS_URL = `${JIANGSHAN_DATA_BASE}/corridors.geojson`;
export const JIANGSHAN_MILESTONES_URL = `${JIANGSHAN_DATA_BASE}/milestones.geojson`;
export const JIANGSHAN_BRIDGE_URL = `${JIANGSHAN_DATA_BASE}/story-bridge.json`;

// ── 纯解析函数（无 fetch，供测试与组件复用）──────────────────────────

/**
 * 区间包含判断（两端包含，§3）：from <= year <= to。
 * from/to 为整数年份（BCE 负数）。缺字段返回 false。
 */
export function inRange(year, from, to) {
  if (!Number.isInteger(year) || !Number.isInteger(from) || !Number.isInteger(to)) {
    return false;
  }
  return year >= from && year <= to;
}

/**
 * 按 index 解析所选年份的当前导航朝代。
 * 遍历 dynasties，返回第一个 [from,to] 包含 year 的；都不含返回 null。
 * 这是 UI 分类不是排他性历史主权判断（§2）。
 */
export function resolveDynasty(index, year) {
  if (!index || !Array.isArray(index.dynasties) || !isValidYear(year)) return null;
  for (const d of index.dynasties) {
    if (inRange(year, d.from, d.to)) return d;
  }
  return null;
}

/**
 * 在朝代内解析所选年份的参考阶段（phase）。
 * 返回第一个 [from,to] 包含 year 的 phase；都不含返回 null。
 */
export function resolvePhase(dynasty, year) {
  if (!dynasty || !Array.isArray(dynasty.phases) || !isValidYear(year)) return null;
  for (const p of dynasty.phases) {
    if (inRange(year, p.from, p.to)) return p;
  }
  return null;
}

/**
 * 阶段缓存键：朝代 key + 快照标识 + from/to。
 * 同一 snapshot 标识可能跨不同区间重复出现（前后导航），因此相位身份
 * 必须包含 from/to，不只 snapshot（coordinator 修正）。保证同 phase 不
 * 重复加载、跨 phase 立即区分。
 */
export function phaseCacheKey(dynasty, phase) {
  if (!dynasty || !phase) return null;
  const snap = phase.snapshot ?? phase.file ?? "?";
  return `${dynasty.key || "?"}::${snap}::${phase.from ?? "?"}::${phase.to ?? "?"}`;
}

/**
 * corridor 在某年是否活跃（from/to 两端包含）。
 * 当 from/to 任一缺失（无 span）时，按上游定义「一直显示」返回 true。
 * WGS84 经纬度坐标由 feature.geometry 承载，年份过滤在此纯按 from/to。
 */
export function corridorActiveAt(feature, year) {
  const p = feature?.properties ?? {};
  // 无 span → 一直显示
  if (!Number.isInteger(p.from) || !Number.isInteger(p.to)) return true;
  if (!Number.isInteger(year)) return false;
  return year >= p.from && year <= p.to;
}

/**
 * 按 dynasty key 过滤 milestones（仅当前朝代，§2）。
 */
export function milestonesForDynasty(milestones, dynastyKey) {
  if (!milestones || !Array.isArray(milestones.features) || !dynastyKey) return [];
  return milestones.features.filter(
    (f) => f?.properties?.dynasty === dynastyKey,
  );
}

/**
 * 在当前朝代 milestones 中高亮所选年份（同年）。
 */
export function milestonesAtYear(dynastyMilestones, year) {
  return dynastyMilestones.filter(
    (f) => f?.properties?.year === year,
  );
}

/**
 * 取 milestone 的 source_key（版本内来源键，§4）。无则 null。
 * 注意：source_key 严禁用于自动故事关联（§4/§2）。
 */
export function milestoneSourceKey(feature) {
  const sk = feature?.properties?.source_key;
  return typeof sk === "string" && sk ? sk : null;
}

/**
 * 取 milestone 可信坐标：上游 exporter 把地点坐标放在 feature.geometry
 * （Point）的 coordinates 中，properties.site 只是地点名称字符串。
 * 无坐标返回 null（不捏造地点，§2）。WGS84 [lng,lat]。
 */
export function milestoneSiteCoordinate(feature) {
  const geom = feature?.geometry;
  if (!geom) return null;
  if (geom.type === "Point" && Array.isArray(geom.coordinates) &&
      geom.coordinates.length === 2 && geom.coordinates.every(Number.isFinite)) {
    return geom.coordinates;
  }
  return null;
}

/**
 * 经审定桥接表查找某 milestone（按 source_key）关联的本站 story_id 列表。
 * 桥接表形如 { entries: [{ source_key, story_ids:[], status, basis }] }。
 * 仅返回 status==="approved" 的条目（未批准按空表运行，§7 夜间变体）。
 */
export function bridgeStoryIds(bridge, sourceKey) {
  if (!bridge || !Array.isArray(bridge.entries) || !sourceKey) return [];
  return bridge.entries
    .filter(
      (e) => e.source_key === sourceKey && e.status === "approved" && Array.isArray(e.story_ids),
    )
    .flatMap((e) => e.story_ids);
}

// ── 安全色回退（缺 tint/anchor 等的明确退化，§5）─────────────────────

const SAFE_POLITY_COLOR = "#D9C7A8";

/**
 * 政权渲染色：优先 display_color，回退 tint，再回退安全色（§4）。
 */
export function polityColor(props) {
  const dc = props?.display_color;
  if (typeof dc === "string" && dc) return dc;
  const tint = props?.tint;
  if (typeof tint === "string" && tint) return tint;
  return SAFE_POLITY_COLOR;
}

/**
 * 政权锚点坐标（properties.anchor）。无则 null。
 */
export function polityAnchor(props) {
  const a = props?.anchor;
  if (Array.isArray(a) && a.length === 2 && a.every(Number.isFinite)) return a;
  if (a && Number.isFinite(a.lng) && Number.isFinite(a.lat)) return [a.lng, a.lat];
  return null;
}

// ── fetch 层（client-side，AbortController + 缓存）────────────────────

/**
 * 带响应检查与超时取消的 fetch JSON。
 * 响应不 ok 或解析失败 → 抛错（调用方捕获后明确退化，不展示过期数据）。
 */
async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`fetch ${url} HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * 创建一个有界快照缓存 + 在途请求表，保证：
 * - 同 phase 不重复加载（命中缓存直接返回）；
 * - 同 phase 并发只发一次（在途 Promise 复用）；
 * - 新 phase 请求取消旧 phase 在途请求（stale 不覆盖）；
 * - LRU 上限避免内存无界（§5）。
 *
 * 返回 { load(key, loader) }：loader 接收 AbortSignal 返回 Promise。
 */
export function createSnapshotCache(maxEntries = 5) {
  const cache = new Map(); // key → { promise, value, controller }
  const order = []; // LRU 顺序（最近用过的在尾）

  function touch(key) {
    const i = order.indexOf(key);
    if (i >= 0) order.splice(i, 1);
    order.push(key);
    while (order.length > maxEntries) {
      const evict = order.shift();
      const entry = cache.get(evict);
      if (entry?.controller) {
        try { entry.controller.abort(); } catch { /* noop */ }
      }
      cache.delete(evict);
    }
  }

  /**
   * 取消并清除除 keepKey 外的所有在途请求（用于切换 phase 时丢弃 stale）。
   */
  function cancelOthers(keepKey) {
    for (const [key, entry] of cache) {
      if (key === keepKey) continue;
      if (entry && !entry.value) {
        try { entry.controller?.abort(); } catch { /* noop */ }
      }
      // 只清未完成的在途条目；已完成的保留为缓存
      if (entry && !entry.value) cache.delete(key);
    }
  }

  async function load(key, loader) {
    const existing = cache.get(key);
    if (existing) {
      touch(key);
      if (existing.value) return existing.value;
      return existing.promise; // 在途复用
    }
    const controller = new AbortController();
    const promise = (async () => {
      try {
        const value = await loader(controller.signal);
        cache.set(key, { promise, value, controller });
        touch(key);
        return value;
      } catch (err) {
        // 失败不缓存，下次重试；明确退化由调用方处理
        cache.delete(key);
        throw err;
      }
    })();
    cache.set(key, { promise, value: null, controller });
    return promise;
  }

  return { load, cancelOthers, _cache: cache };
}

/**
 * 加载 jiangshan index（无缓存：很小，常驻；失败抛错）。
 */
export async function fetchJiangshanIndex(signal) {
  return fetchJson(JIANGSHAN_INDEX_URL, signal);
}

/**
 * 加载 corridors.geojson（一次加载常驻内存，按年过滤）。
 */
export async function fetchCorridors(signal) {
  return fetchJson(JIANGSHAN_CORRIDORS_URL, signal);
}

/**
 * 加载 milestones.geojson（一次加载常驻，按朝代过滤）。
 */
export async function fetchMilestones(signal) {
  return fetchJson(JIANGSHAN_MILESTONES_URL, signal);
}

/**
 * 加载审定桥接表（可选；缺失返回空表，不捏造关联）。
 */
export async function fetchBridge(signal) {
  try {
    return await fetchJson(JIANGSHAN_BRIDGE_URL, signal);
  } catch {
    return { entries: [] };
  }
}

/**
 * 按 phase.file 加载政权快照 GeoJSON。
 * phase.file 为相对 base 的路径（如 "snapshots/western-han.geojson"）。
 */
export function snapshotUrlForPhase(phase) {
  if (!phase || !phase.file) return null;
  const file = phase.file.startsWith("/") ? phase.file : `${JIANGSHAN_DATA_BASE}/${phase.file}`;
  return file;
}

export { JIANGSHAN_MIN_YEAR, JIANGSHAN_MAX_YEAR };
