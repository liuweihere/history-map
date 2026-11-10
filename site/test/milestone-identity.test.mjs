// Phase 0 RED→GREEN test: milestone 持久源 ID + 重复课程已清理 + 真实口述状态。
//
// 验收项（PLAN.md V3 §5 / §7 / §8 morning report 决策包①②）：
// - milestone_id 在课程源维护，独立持久：修改标题和年份与重排不改变身份。
// - 禁止凭年份标题派生永久 ID（旧 ms-{year}-{label} 方案已废弃）。
// - 导出校验缺失/重复清楚报错。
// - 两组完全重复的课程条目（150 江南可采莲、220 三国鼎立）各保留一条。
// - 旧故事 ID 行为不破坏（story_id 仍正确映射）。
// - 真实口述状态：曹植（及所有占位源）不得标记 recorded。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const dataRoot = path.join(process.cwd(), "public/data/generated");
const raw = await readFile(path.join(dataRoot, "timeline-rail.json"), "utf8");
const { milestones } = JSON.parse(raw);

// 已知重复课程（用户已授权各删除一个副本，保留一条）
const FORMER_DUPLICATES = [
  { year: 150, label: "江南可采莲" },
  { year: 220, label: "三国鼎立" },
];

test("每个里程碑都拥有非空 milestone_id 和 render_key", () => {
  for (const m of milestones) {
    assert.ok(typeof m.milestone_id === "string" && m.milestone_id.length > 0, `缺 milestone_id (year=${m.year})`);
    assert.ok(typeof m.render_key === "string" && m.render_key.length > 0, `缺 render_key (year=${m.year})`);
  }
});

test("所有 milestone_id 互不重复（持久唯一身份）", () => {
  const ids = milestones.map((m) => m.milestone_id);
  const seen = new Map();
  for (let i = 0; i < ids.length; i++) {
    const dup = seen.get(ids[i]);
    assert.ok(dup === undefined, `milestone_id 重复：index ${dup} 与 ${i} 都是 "${ids[i]}"`);
    seen.set(ids[i], i);
  }
});

test("所有 render_key 互不重复（避免 React key 碰撞）", () => {
  const keys = milestones.map((m) => m.render_key);
  const seen = new Map();
  for (let i = 0; i < keys.length; i++) {
    const dup = seen.get(keys[i]);
    assert.ok(dup === undefined, `render_key 碰撞：index ${dup} 与 ${i} 都是 "${keys[i]}"`);
    seen.set(keys[i], i);
  }
});

test("milestone_id 不是凭年份标题派生（禁止 ms-{year}-{label} 格式）", () => {
  for (const m of milestones) {
    const slug = m.label.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "");
    const forbidden = `ms-${m.year}-${slug}`;
    assert.notEqual(m.milestone_id, forbidden,
      `milestone_id 不得为年份标题派生 "${forbidden}"（year=${m.year}）`);
  }
});

test("milestone_id 格式为源持久 ID（ms_NNN 数字序列，非内容派生）", () => {
  for (const m of milestones) {
    assert.match(m.milestone_id, /^ms_\d+$/,
      `milestone_id 应为 ms_NNN 格式（源持久 ID），实际 "${m.milestone_id}"`);
  }
});

test("已知重复课程各保留一条（150 江南可采莲、220 三国鼎立）", () => {
  for (const { year, label } of FORMER_DUPLICATES) {
    const group = milestones.filter((m) => m.year === year && m.label === label);
    assert.equal(group.length, 1,
      `(year=${year}, label=${label}) 应保留一条，实际 ${group.length}`);
  }
});

test("无任何里程碑被标记 duplicate=true（重复已清理）", () => {
  const dups = milestones.filter((m) => m.duplicate === true);
  assert.equal(dups.length, 0, `不应有 duplicate=true 标记：${dups.map((m) => m.milestone_id).join(",")}`);
});

test("planned 里程碑也拥有持久 milestone_id", () => {
  const planned = milestones.filter((m) => m.story_status === "planned" || !m.story_id);
  assert.ok(planned.length > 0, "应有 planned 里程碑");
  for (const m of planned) {
    assert.ok(m.milestone_id, `planned (year=${m.year}) 缺 milestone_id`);
    assert.match(m.milestone_id, /^ms_\d+$/, `planned milestone_id 应为持久 ID`);
  }
});

test("narration_status 存在且无 interactive 故事被误标 recorded（缺乏证据不标 recorded）", () => {
  for (const m of milestones) {
    assert.ok(
      ["recorded", "placeholder", "unknown"].includes(m.narration_status),
      `(year=${m.year}) narration_status 非法: ${m.narration_status}`,
    );
  }
  const interactive = milestones.filter((m) => m.story_id);
  const recordedNarr = interactive.filter((m) => m.narration_status === "recorded");
  assert.equal(recordedNarr.length, 0, `缺乏证据不得标 recorded：${recordedNarr.map((m) => m.story_id).join(",")}`);
});

test("曹植七步成诗（story_006）口述为 placeholder 而非 recorded", () => {
  const caoZhi = milestones.find((m) => m.story_id === "story_006_cao_zhi_qi_bu_cheng_shi");
  assert.ok(caoZhi, "曹植七步成诗里程碑应存在");
  assert.equal(caoZhi.narration_status, "placeholder", "曹植口述应为 placeholder");
  assert.notEqual(caoZhi.narration_status, "recorded", "曹植口述不得为 recorded");
});

test("旧 story_id 行为不破坏：有 story_id 的里程碑仍可按 story_id 选取", () => {
  const interactive = milestones.filter((m) => m.story_id);
  assert.ok(interactive.length > 0, "应有 interactive 里程碑");
  const ids = interactive.map((m) => m.story_id);
  assert.equal(new Set(ids).size, ids.length, "story_id 应互不重复");
});

test("milestone_id 持久性：同年不同标题的里程碑 ID 不同（不因年份碰撞）", () => {
  // 199 年有三个故事，它们的 milestone_id 必须互不相同
  const year199 = milestones.filter((m) => m.year === 199);
  assert.ok(year199.length >= 3, "199 年应至少三个里程碑");
  const ids = year199.map((m) => m.milestone_id);
  assert.equal(new Set(ids).size, ids.length, "同年里程碑 milestone_id 必须互不相同");
});

test("里程碑总数合理（删除 2 个重复后应减少 2）", () => {
  // 原始 97 行，删除 2 个重复副本后应为 95
  assert.equal(milestones.length, 95, `里程碑总数应为 95（97-2 重复），实际 ${milestones.length}`);
});
