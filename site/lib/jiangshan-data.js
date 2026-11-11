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

// ── Phase 2 · 故事地图参考（map_ref）审定绑定 ───────────────────────
//
// 设计依据 PLAN.md V3 §2/§3/§4/§5、§7 夜间变体：
// - 故事的地图参考由 wiki 审定的 map_ref 字段绑定（snapshot_id + rationale +
//   status + data_version），不按故事年份自动猜快照（§3：项羽 -202 通用解析
//   会落到 s_xihan_a，审定应指向 s_qin_chuhan 楚汉局势）。
// - status="proposed" = 候选待人工审定；不作正式地图激活，正式地图仍走手绘
//   overlay_boundary 回退，UI 可显示待审候选信息（§7 夜间变体：proposed 写入
//   并实现渲染逻辑，但未批准前不激活）。
// - status="approved" 必须有非空人工理由 + 可校验版本；缺失/失配/快照缺失/
//   加载失败均显式回退手绘，绝不静默复用（§5 地图与状态验收）。
// - 候选不含 AI 审定的理由；人工填理由并改 approved 后无需改码即激活。
//
// 版本身份 vs 字节完整性：
// - resolveStorySnapshotRef 仅做版本身份元数据匹配（map_ref.data_version 的
//   sha256 与 manifest 声明的 sha256 一致），不核验实际加载响应字节。
// - verifySnapshotBytes 在 fetch 后实际计算响应字节 sha256 与 manifest 比对，
//   才能声称字节完整性（防止内容变更但 manifest 不变的情况）。

/**
 * 在 index 所有 phases 中查找 snapshot_id 对应的 phase。
 * @returns {object|null} phase 对象或 null（未找到）。
 */
export function findPhaseBySnapshot(index, snapshotId) {
  if (!index || !Array.isArray(index.dynasties) || !snapshotId) return null;
  for (const d of index.dynasties) {
    for (const p of d.phases ?? []) {
      if (p.snapshot === snapshotId) return p;
    }
  }
  return null;
}

/**
 * 从 manifest 中取指定文件路径的 sha256。
 * @returns {string|null}
 */
export function manifestShaFor(manifest, relPath) {
  if (!manifest || !Array.isArray(manifest.output_files)) return null;
  const entry = manifest.output_files.find((f) => f.path === relPath);
  return entry ? entry.sha256 : null;
}

/**
 * 解析故事的审定地图参考（map_ref）。
 *
 * 返回 { kind, snapshot_id, phase, rationale, version_ok, reason? }：
 * - kind="approved"：已审定且版本/理由齐备，可作正式地图加载。
 * - kind="proposed"：候选待人工审定；不作正式地图激活（手绘回退），UI 可
 *   显示候选信息。快照不存在时退化为 none。
 * - kind="none"：不加载审定快照，走手绘 overlay_boundary 回退。reason 标明
 *   退化原因：no_map_ref / invalid_status / snapshot_not_found /
 *   approved_rationale_missing / version_mismatch。
 *
 * 版本身份元数据匹配（非字节完整性）：仅比对 map_ref.data_version 声明的
 * sha256 与 manifest 记录值是否一致；不核验实际加载字节。字节完整性由
 * verifySnapshotBytes 在 fetch 后负责。
 */
export function resolveStorySnapshotRef(index, manifest, story) {
  const mapRef = story?.map_plan?.map_ref;
  if (!mapRef || typeof mapRef !== "object") {
    return { kind: "none", reason: "no_map_ref", snapshot_id: null, phase: null, rationale: null, version_ok: false };
  }
  const snapshotId = typeof mapRef.snapshot_id === "string" ? mapRef.snapshot_id : null;
  const status = typeof mapRef.status === "string" ? mapRef.status : null;
  const rationale = typeof mapRef.rationale === "string" ? mapRef.rationale : "";

  if (status !== "proposed" && status !== "approved") {
    return { kind: "none", reason: "invalid_status", snapshot_id: snapshotId, phase: null, rationale, version_ok: false };
  }

  const phase = findPhaseBySnapshot(index, snapshotId);
  if (!phase) {
    return { kind: "none", reason: "snapshot_not_found", snapshot_id: snapshotId, phase: null, rationale, version_ok: false };
  }

  if (status === "proposed") {
    // proposed：候选态，不作正式地图激活；版本是否匹配不影响候选展示，
    // 但 phase 必须存在（已校验）。version_ok 仅作信息，不阻塞候选显示。
    return { kind: "proposed", snapshot_id: snapshotId, phase, rationale, version_ok: null };
  }

  // status === "approved"：必须有非空人工理由 + 可校验版本
  if (!rationale || rationale.trim().length === 0) {
    return { kind: "none", reason: "approved_rationale_missing", snapshot_id: snapshotId, phase, rationale, version_ok: false };
  }

  const dataVersion = mapRef.data_version;
  if (!dataVersion || typeof dataVersion !== "object") {
    return { kind: "none", reason: "version_mismatch", snapshot_id: snapshotId, phase, rationale, version_ok: false };
  }
  const expectedIndexSha = manifestShaFor(manifest, "index.json");
  const expectedSnapSha = manifestShaFor(manifest, `snapshots/${snapshotId}.geojson`);
  const boundIndexSha = typeof dataVersion.index_sha256 === "string" ? dataVersion.index_sha256 : null;
  const boundSnapSha = typeof dataVersion.snapshot_sha256 === "string" ? dataVersion.snapshot_sha256 : null;
  if (!expectedIndexSha || !expectedSnapSha || boundIndexSha !== expectedIndexSha || boundSnapSha !== expectedSnapSha) {
    return { kind: "none", reason: "version_mismatch", snapshot_id: snapshotId, phase, rationale, version_ok: false };
  }

  return { kind: "approved", snapshot_id: snapshotId, phase, rationale, version_ok: true };
}

/**
 * 审定快照 URL（approved 或 proposed 候选展示用）。
 * none 返回 null。
 */
export function snapshotUrlForRef(ref) {
  if (!ref || !ref.phase || !ref.phase.file) return null;
  const file = ref.phase.file.startsWith("/") ? ref.phase.file : `${JIANGSHAN_DATA_BASE}/${ref.phase.file}`;
  return file;
}

/**
 * 通用字节完整性校验：实际计算响应字节 sha256 并与 manifest 声明比对。
 *
 * 版本身份元数据匹配（resolveStorySnapshotRef）不等于字节完整性——若实际
 * 文件内容被改动而 manifest 未更新，元数据匹配仍会通过。本函数在 fetch
 * 响应到达后调用，对响应字节计算 sha-256，与 manifest 中对应文件 sha256
 * 比对，才能真正声称内容完整。
 *
 * @param {Uint8Array|ArrayBuffer} bytes  fetch 响应字节
 * @param {object} manifest  jiangshan manifest.json
 * @param {string} relPath  manifest output_files 中的相对路径（如 "index.json"）
 * @returns {Promise<boolean>}
 */
export async function verifyBytesAgainstManifest(bytes, manifest, relPath) {
  if (!manifest || !relPath) return false;
  const expected = manifestShaFor(manifest, relPath);
  if (!expected) return false;
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (!data || !(data.byteLength >= 0)) return false;
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hashBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === expected;
}

/**
 * 快照字节完整性校验（verifyBytesAgainstManifest 的快照专用包装）。
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {object} manifest
 * @param {string} snapshotId  快照标识（如 s_qin_chuhan）
 * @returns {Promise<boolean>}
 */
export async function verifySnapshotBytes(bytes, manifest, snapshotId) {
  if (!snapshotId) return false;
  return verifyBytesAgainstManifest(bytes, manifest, `snapshots/${snapshotId}.geojson`);
}

/**
 * 故事地图参考审定状态的 UI 徽章文案（§2 故事学习状态：所选参考快照、
 * 选择理由分别显示）。纯函数，供组件与测试共用。
 *
 * 所有退化原因（version_mismatch / snapshot_not_found /
 * approved_rationale_missing / invalid_status / data_load_failed /
 * snapshot_load_failed / byte_check_unavailable）均显示失效回退提示，
 * 不得静默。no_map_ref 返回 null（纯底座故事本无审定参考，无需徽章）。
 *
 * @returns {{className:string,text:string}|null}
 */
export function mapRefBadgeText(refStatus) {
  if (!refStatus) return null;
  if (refStatus.kind === "approved") {
    const rationale = refStatus.rationale ? `：${refStatus.rationale}` : "";
    return {
      className: "history-map-ref-badge history-map-ref-badge--approved",
      text: `审定参考·${refStatus.snapshot_id}${rationale}`,
    };
  }
  if (refStatus.kind === "proposed") {
    return {
      className: "history-map-ref-badge history-map-ref-badge--proposed",
      text: `待审候选·${refStatus.snapshot_id}（理由待人工审定，正式地图走手绘示意）`,
    };
  }
  // none：按退化原因显示回退提示（no_map_ref 不在表中 → null）
  const reasonText = DEGRADATION_REASONS[refStatus.reason] ?? null;
  return reasonText
    ? { className: "history-map-ref-badge history-map-ref-badge--fallback", text: reasonText }
    : null;
}

// 退化原因 → UI 文案映射（no_map_ref 不在此表 → null，纯底座无徽章）。
const DEGRADATION_REASONS = {
  version_mismatch: "快照版本不符，回退手绘示意",
  snapshot_not_found: "参考快照缺失，回退手绘示意",
  approved_rationale_missing: "审定理由缺失，回退手绘示意",
  invalid_status: "审定状态无效，回退手绘示意",
  data_load_failed: "参考数据加载失败，回退手绘示意",
  snapshot_load_failed: "审定快照加载失败，回退手绘示意",
  byte_check_unavailable: "字节校验不可用（非安全上下文），回退手绘示意",
};

/**
 * 当前环境是否可用 WebCrypto subtle（字节完整性校验前提）。
 * 非安全上下文（http LAN、部分浏览器）无 crypto.subtle → 字节校验不可用，
 * approved 不得加载（不得假装已验证）。
 */
export function isByteVerificationAvailable() {
  return (
    typeof crypto !== "undefined" &&
    !!crypto &&
    !!crypto.subtle &&
    typeof crypto.subtle.digest === "function"
  );
}

/**
 * 决定是否应加载审定快照（approved 路径准入）。
 *
 * @param {object} ref  resolveStorySnapshotRef 返回值
 * @param {{byteCheckAvailable:boolean}} options
 * @returns {{shouldLoad:boolean, statusOnSkip:object|null}}
 *   - ref.kind !== "approved" → 不加载（proposed/none 维持原状）
 *   - approved 但字节校验不可用 → 不加载，statusOnSkip 降级为 none(byte_check_unavailable)
 *   - approved 且字节校验可用 → shouldLoad=true
 */
export function decideMapRefLoad(ref, { byteCheckAvailable } = {}) {
  if (!ref || ref.kind !== "approved") {
    return { shouldLoad: false, statusOnSkip: null };
  }
  if (!byteCheckAvailable) {
    return {
      shouldLoad: false,
      statusOnSkip: {
        kind: "none",
        reason: "byte_check_unavailable",
        snapshot_id: ref.snapshot_id,
        rationale: ref.rationale,
      },
    };
  }
  return { shouldLoad: true, statusOnSkip: null };
}

/**
 * approved 加载/字节校验失败后的降级状态。
 * 关键：失败后状态必须是 none（带原因），不得保留 approved（地图回退却谎称审定）。
 * @param {object} ref  原始 approved ref
 * @param {"snapshot_load_failed"|"byte_check_failed"} reason
 */
export function mapRefStatusOnApprovedFailure(ref, reason = "snapshot_load_failed") {
  return {
    kind: "none",
    reason,
    snapshot_id: ref?.snapshot_id ?? null,
    rationale: ref?.rationale ?? null,
  };
}

export { JIANGSHAN_MIN_YEAR, JIANGSHAN_MAX_YEAR };
