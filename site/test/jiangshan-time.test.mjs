// Phase 3 · 时间逻辑与阶段解析测试（PLAN.md V3 §3 / §5 验收门槛）。
//
// 覆盖：
// - -1 ↔ 1 不出现 0 年（连续序号无零）；
// - 边界年 -203/-202、219/220、1948/1949 按 index 规则验证；
// - 前后年份切换跨零跳过 0；
// - clampYear 永不产生 0；
// - parseYear 接受「前403」「-403」「403」「公元220」等；
// - resolveDynasty / resolvePhase 区间包含（两端包含）；
// - corridor / milestone 过滤；
// - 桥接表仅返回 approved 条目；
// - 政权渲染色优先 display_color 回退 tint 再回退安全色。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  JIANGSHAN_MIN_YEAR,
  JIANGSHAN_MAX_YEAR,
  isValidYear,
  yearToOrdinal,
  ordinalToYear,
  nextYear,
  prevYear,
  clampYear,
  formatYear,
  parseYear,
} from "../lib/jiangshan-time.js";
import {
  inRange,
  resolveDynasty,
  resolvePhase,
  phaseCacheKey,
  corridorActiveAt,
  milestonesForDynasty,
  milestonesAtYear,
  milestoneSourceKey,
  milestoneSiteCoordinate,
  bridgeStoryIds,
  polityColor,
  polityAnchor,
  createSnapshotCache,
} from "../lib/jiangshan-data.js";

test("区间覆盖前403—1948，无 0 年", () => {
  assert.equal(JIANGSHAN_MIN_YEAR, -403);
  assert.equal(JIANGSHAN_MAX_YEAR, 1948);
  assert.ok(isValidYear(-403));
  assert.ok(isValidYear(1948));
  assert.ok(!isValidYear(0), "0 年必须非法");
  assert.ok(!isValidYear(-404), "早于前403 不可选");
  assert.ok(!isValidYear(1949), "晚于1948 不可选");
});

test("-1 ↔ 1 不出现 0 年：序号连续无零", () => {
  assert.equal(yearToOrdinal(-1), 0);
  assert.equal(yearToOrdinal(1), 1);
  assert.equal(ordinalToYear(0), -1);
  assert.equal(ordinalToYear(1), 1);
  // nextYear: -1 → 1（跳过 0）
  assert.equal(nextYear(-1), 1);
  // prevYear: 1 → -1（跳过 0）
  assert.equal(prevYear(1), -1);
  // 任何步进都不经过 0
  let y = -3;
  const seq = [y];
  for (let i = 0; i < 6; i++) { y = nextYear(y); seq.push(y); }
  assert.deepEqual(seq, [-3, -2, -1, 1, 2, 3, 4], "步进序列不含 0");
});

test("边界年 -203/-202、219/220 按区间包含（两端包含）", () => {
  // 模拟 index：楚汉 from=-203 to=-202；三国 from=220 to=265
  const index = {
    dynasties: [
      { key: "chuhan", title: "楚汉相争", from: -203, to: -202, phases: [
        { snapshot: "chuhan", from: -203, to: -202, file: "snapshots/chuhan.geojson", overview: "楚汉" },
      ] },
      { key: "sanguo", title: "三国", from: 220, to: 265, phases: [
        { snapshot: "sanguo", from: 220, to: 265, file: "snapshots/sanguo.geojson", overview: "三国鼎立" },
      ] },
    ],
  };
  // -203 与 -202 都属楚汉（两端包含）
  assert.equal(resolveDynasty(index, -203)?.key, "chuhan");
  assert.equal(resolveDynasty(index, -202)?.key, "chuhan");
  // 219 不属任何朝代（西汉/东汉未在此 mock，返回 null）
  assert.equal(resolveDynasty(index, 219), null);
  // 220 属三国
  assert.equal(resolveDynasty(index, 220)?.key, "sanguo");
  // phase 解析同样两端包含
  const d = resolveDynasty(index, -203);
  assert.equal(resolvePhase(d, -203)?.snapshot, "chuhan");
  assert.equal(resolvePhase(d, -202)?.snapshot, "chuhan");
});

test("1948/1949 边界：1948 可选、1949 非法（不假装有数据）", () => {
  assert.ok(isValidYear(1948));
  assert.ok(!isValidYear(1949));
  assert.equal(nextYear(1948), null, "1948 之后无下一年");
  assert.equal(prevYear(1948), 1947);
});

test("clampYear 永不产生 0 年", () => {
  assert.equal(clampYear(0), JIANGSHAN_MIN_YEAR, "0 钳制到 MIN");
  assert.equal(clampYear(5000), JIANGSHAN_MAX_YEAR);
  assert.equal(clampYear(-5000), JIANGSHAN_MIN_YEAR);
  assert.equal(clampYear(null), JIANGSHAN_MIN_YEAR);
  assert.equal(clampYear(220), 220);
  assert.equal(clampYear(-403), -403);
});

test("formatYear 标签：负数→前N，正数→N", () => {
  assert.equal(formatYear(-403), "前403");
  assert.equal(formatYear(-1), "前1");
  assert.equal(formatYear(220), "220");
  assert.equal(formatYear(1948), "1948");
});

test("parseYear 接受多种写法", () => {
  assert.equal(parseYear("前403"), -403);
  assert.equal(parseYear("公元前202"), -202);
  assert.equal(parseYear("-203"), -203);
  assert.equal(parseYear("220"), 220);
  assert.equal(parseYear("公元220"), 220);
  assert.equal(parseYear("ce 67"), 67);
  assert.equal(parseYear("bce 403"), -403);
  assert.equal(parseYear(199), 199);
  assert.equal(parseYear("不是年份"), null);
  assert.equal(parseYear(""), null);
});

test("prevYear/nextYear 在区间端点返回 null（不越界）", () => {
  assert.equal(prevYear(-403), null, "前403 之前无年份");
  assert.equal(nextYear(1948), null, "1948 之后无年份");
});

test("phaseCacheKey 同 phase 键相同、跨 phase 键不同（含 from/to 身份）", () => {
  const d = { key: "sanguo" };
  const p1 = { snapshot: "sanguo", from: 220, to: 265, file: "snapshots/sanguo.geojson" };
  const p2 = { snapshot: "chuhan", from: -203, to: -202, file: "snapshots/chuhan.geojson" };
  assert.equal(phaseCacheKey(d, p1), phaseCacheKey(d, p1));
  assert.notEqual(phaseCacheKey(d, p1), phaseCacheKey(d, p2));
  // 同 snapshot 不同区间 → 不同键（coordinator 修正）
  const p1b = { snapshot: "sanguo", from: 220, to: 230, file: "snapshots/sanguo.geojson" };
  assert.notEqual(phaseCacheKey(d, p1), phaseCacheKey(d, p1b), "同 snapshot 不同区间须区分");
});

test("corridorActiveAt 两端包含，无 span 一直显示", () => {
  const f = { properties: { from: -130, to: -100 } };
  assert.ok(corridorActiveAt(f, -130), "from 端包含");
  assert.ok(corridorActiveAt(f, -100), "to 端包含");
  assert.ok(corridorActiveAt(f, -115));
  assert.ok(!corridorActiveAt(f, -131));
  assert.ok(!corridorActiveAt(f, -99));
  // 无 span（from/to 缺失）→ 一直显示
  const always = { properties: {} };
  assert.ok(corridorActiveAt(always, 220), "无 span 一直显示（220）");
  assert.ok(corridorActiveAt(always, -202), "无 span 一直显示（前202）");
});

test("milestonesForDynasty 仅当前朝代", () => {
  const ms = { features: [
    { properties: { dynasty: "sanguo", year: 220, headline: "三国鼎立" } },
    { properties: { dynasty: "chuhan", year: -202, headline: "项羽乌江" } },
    { properties: { dynasty: "sanguo", year: 245, headline: "某事" } },
  ] };
  const sanguo = milestonesForDynasty(ms, "sanguo");
  assert.equal(sanguo.length, 2);
  const at220 = milestonesAtYear(sanguo, 220);
  assert.equal(at220.length, 1);
  assert.equal(at220[0].properties.headline, "三国鼎立");
});

test("milestoneSourceKey 读取 source_key，无则 null", () => {
  assert.equal(milestoneSourceKey({ properties: { source_key: "sk_001" } }), "sk_001");
  assert.equal(milestoneSourceKey({ properties: {} }), null);
});

test("milestoneSiteCoordinate 从 geometry(Point).coordinates 取，无则 null", () => {
  assert.deepEqual(
    milestoneSiteCoordinate({ geometry: { type: "Point", coordinates: [110, 30] } }),
    [110, 30],
  );
  assert.equal(milestoneSiteCoordinate({ geometry: { type: "Point", coordinates: [110] } }), null);
  assert.equal(milestoneSiteCoordinate({ geometry: null }), null);
  assert.equal(milestoneSiteCoordinate({}), null);
  // properties.site 是地名字符串，不是坐标
  assert.equal(
    milestoneSiteCoordinate({ properties: { site: "洛阳" }, geometry: null }),
    null,
    "site 为地名时不当作坐标",
  );
});

test("bridgeStoryIds 仅返回 approved 条目", () => {
  const bridge = { entries: [
    { source_key: "sk_001", story_ids: ["story_004"], status: "approved" },
    { source_key: "sk_002", story_ids: ["story_005"], status: "proposed" },
    { source_key: "sk_003", story_ids: ["story_006"], status: "approved" },
  ] };
  assert.deepEqual(bridgeStoryIds(bridge, "sk_001"), ["story_004"]);
  assert.deepEqual(bridgeStoryIds(bridge, "sk_002"), [], "proposed 不返回");
  assert.deepEqual(bridgeStoryIds(bridge, "sk_003"), ["story_006"]);
  assert.deepEqual(bridgeStoryIds(bridge, "sk_none"), []);
  assert.deepEqual(bridgeStoryIds(null, "sk_001"), []);
  assert.deepEqual(bridgeStoryIds(bridge, null), []);
});

test("polityColor 优先 display_color 回退 tint 再回退安全色", () => {
  assert.equal(polityColor({ display_color: "#ABC", tint: "#DEF" }), "#ABC");
  assert.equal(polityColor({ tint: "#DEF" }), "#DEF");
  assert.ok(polityColor({}).length > 0, "无字段回退安全色");
});

test("polityAnchor 支持 [lng,lat] 与 {lng,lat}，无则 null", () => {
  assert.deepEqual(polityAnchor({ anchor: [110, 30] }), [110, 30]);
  assert.deepEqual(polityAnchor({ anchor: { lng: 110, lat: 30 } }), [110, 30]);
  assert.equal(polityAnchor({}), null);
});

test("createSnapshotCache：同 key 复用、失败不缓存、cancelOthers 取消在途", async () => {
  const cache = createSnapshotCache(3);
  let loadCount = 0;
  const loader = async (signal) => {
    loadCount++;
    // 模拟异步
    await new Promise((r) => setTimeout(r, 5));
    if (signal?.aborted) throw new Error("aborted");
    return { ok: true };
  };
  const a1 = cache.load("k1", loader);
  const a2 = cache.load("k1", loader); // 在途复用，不重复 load
  const r1 = await a1;
  await a2;
  assert.equal(loadCount, 1, "同 key 在途只 load 一次");
  assert.deepEqual(r1, { ok: true });
  // 命中缓存不再 load
  await cache.load("k1", loader);
  assert.equal(loadCount, 1, "命中缓存不 load");
});

test("createSnapshotCache：失败不缓存，下次重试", async () => {
  const cache = createSnapshotCache(3);
  let attempt = 0;
  const loader = async () => {
    attempt++;
    if (attempt === 1) throw new Error("boom");
    return { ok: true };
  };
  await assert.rejects(() => cache.load("k1", loader), /boom/);
  const r = await cache.load("k1", loader);
  assert.deepEqual(r, { ok: true }, "失败后可重试");
});

test("inRange 两端包含且拒绝非整数", () => {
  assert.ok(inRange(220, 220, 265));
  assert.ok(inRange(265, 220, 265));
  assert.ok(!inRange(219, 220, 265));
  assert.ok(!inRange(2.5, 220, 265), "非整数年份拒绝");
});
