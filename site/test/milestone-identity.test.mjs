// Phase 0 RED→GREEN test: milestone 稳定身份 + 重复课程检测 + 真实口述状态。
//
// 验收项（PLAN.md V3 §5 / §7）：
// - milestone 不得用数组位置冒充稳定 ID；planned、重复、重排后身份稳定。
// - 重复课程条目（150 江南可采莲、220 三国鼎立）需检测并报告；
//   原始重复行不删除、不自作教学裁决，冲突明确提示并允许安全显示。
// - 不生成误导性长期 ID；避免 React key 碰撞。
// - 真实口述状态：曹植（及所有占位源）不得标记 recorded；从 source 编译进输出。
//
// 诚实边界：完全相同的重复记录无法获得有意义的永久独立身份。
// milestone_id 是内容确定性基底（重复行共享同一 id = 冲突），
// render_key 是唯一渲染键（#N 后缀，临时、非稳定身份、不得跨版本长期引用）。
// 重复行标 duplicate=true 待人工裁决。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const dataRoot = path.join(process.cwd(), "public/data/generated");
const raw = await readFile(path.join(dataRoot, "timeline-rail.json"), "utf8");
const { milestones } = JSON.parse(raw);

const KNOWN_DUPLICATES = [
  { year: 150, label: "江南可采莲" },
  { year: 220, label: "三国鼎立" },
];

function expectedContentKey(year, label) {
  const slug = label.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "");
  return `ms-${year}-${slug}`;
}

test("每个里程碑都拥有非空 milestone_id 和 render_key", () => {
  for (const m of milestones) {
    assert.ok(typeof m.milestone_id === "string" && m.milestone_id.length > 0, `缺 milestone_id (year=${m.year})`);
    assert.ok(typeof m.render_key === "string" && m.render_key.length > 0, `缺 render_key (year=${m.year})`);
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

test("milestone_id 是内容确定性函数（非数组位置）：非重复行 id=内容基底", () => {
  const dupKeys = new Set(KNOWN_DUPLICATES.map(({ year, label }) => `${year}|${label}`));
  for (const m of milestones) {
    if (dupKeys.has(`${m.year}|${m.label}`)) continue;
    assert.equal(m.milestone_id, expectedContentKey(m.year, m.label), `非重复 milestone_id 应为内容基底`);
  }
});

test("已知重复课程被检测并标记 duplicate=true（150 江南可采莲、220 三国鼎立）", () => {
  for (const { year, label } of KNOWN_DUPLICATES) {
    const group = milestones.filter((m) => m.year === year && m.label === label);
    assert.ok(group.length >= 2, `(year=${year}, label=${label}) 原始重复行应保留`);
    for (const m of group) {
      assert.equal(m.duplicate, true, `(year=${year}) 应标记 duplicate=true`);
    }
  }
});

test("重复行共享同一 milestone_id（诚实冲突），render_key 靠 #N 区分", () => {
  for (const { year, label } of KNOWN_DUPLICATES) {
    const group = milestones.filter((m) => m.year === year && m.label === label);
    const ids = group.map((m) => m.milestone_id);
    assert.equal(new Set(ids).size, 1, `(year=${year}) 重复行 milestone_id 应相同（冲突）`);
    assert.equal(ids[0], expectedContentKey(year, label), `基底应等于内容 key`);
    const rks = group.map((m) => m.render_key);
    assert.equal(new Set(rks).size, rks.length, `(year=${year}) render_key 应唯一`);
    for (const rk of rks) {
      assert.ok(/#\d+$/.test(rk), `(year=${year}) 重复行 render_key 应含 #N 后缀`);
    }
  }
});

test("重复组拥有 duplicate_index / duplicate_count，标冲突待人工", () => {
  for (const { year, label } of KNOWN_DUPLICATES) {
    const group = milestones.filter((m) => m.year === year && m.label === label);
    const indices = group.map((m) => m.duplicate_index);
    assert.equal(new Set(indices).size, indices.length, `(year=${year}) duplicate_index 应唯一`);
    for (const idx of indices) {
      assert.ok(Number.isInteger(idx) && idx >= 0, `(year=${year}) duplicate_index 应为非负整数`);
    }
    for (const m of group) {
      assert.ok(m.duplicate_count >= group.length, `(year=${year}) duplicate_count ≥ ${group.length}`);
    }
  }
});

test("非重复里程碑不得被误标 duplicate=true", () => {
  const dupKeys = new Set(KNOWN_DUPLICATES.map(({ year, label }) => `${year}|${label}`));
  const fp = milestones.filter((m) => m.duplicate === true && !dupKeys.has(`${m.year}|${m.label}`));
  assert.equal(fp.length, 0, `非重复被误标 duplicate: ${fp.map((m) => m.milestone_id).join(",")}`);
});

test("原始重复行未被删除（不自作教学裁决）", () => {
  for (const { year, label } of KNOWN_DUPLICATES) {
    const group = milestones.filter((m) => m.year === year && m.label === label);
    assert.ok(group.length >= 2, `(year=${year}) 重复行至少 2 条，实际 ${group.length}`);
  }
});

test("planned 里程碑也拥有 milestone_id 和 render_key", () => {
  const planned = milestones.filter((m) => m.story_status === "planned" || !m.story_id);
  assert.ok(planned.length > 0, "应有 planned 里程碑");
  for (const m of planned) {
    assert.ok(m.milestone_id, `planned (year=${m.year}) 缺 milestone_id`);
    assert.ok(m.render_key, `planned (year=${m.year}) 缺 render_key`);
  }
});

test("narration_status 存在且无 interactive 故事被误标 recorded（缺乏证据不标 recorded）", () => {
  for (const m of milestones) {
    assert.ok(
      ["recorded", "placeholder", "unknown"].includes(m.narration_status),
      `(year=${m.year}) narration_status 非法: ${m.narration_status}`,
    );
  }
  // 有 story_id 的里程碑 narration_status 不得为 recorded（本轮无显式正面证据）
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
