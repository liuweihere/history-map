// Phase 0 RED→GREEN test: story selection must be by stable story_id, not year.
//
// 验收项（PLAN.md V3 §5 / §7）：199 CE 三个故事（煮酒论英雄/望梅止渴/绝妙好辞）
// 必须互不串线；列表点击、时间滑块/键盘分别可选择；涉及 docked 状态及
// 同年节点唯一性；同年 active 高亮必须以选中 story_id 定位（不能全部点亮）。
// 年份是日期不是身份。
//
// 本测试加载真实数据（site/public/data/generated/*.json，经 getChronicleData
// 汇成 entries + timeline），覆盖组件实际使用的选择数据流（history-atlas-app
// 委托给 lib/story-selection.js），而非仅测试孤立 helper。

import { test } from "node:test";
import assert from "node:assert/strict";

import { getChronicleData } from "../lib/history-data.js";
import {
  buildMilestones,
  selectEntryByStoryId,
  selectMilestoneByStoryId,
  milestoneInteractive,
  storyIdFromMilestone,
} from "../lib/story-selection.js";

const { entries, timeline } = await getChronicleData();
const rail = timeline?.milestones ?? [];

// 三个 199 CE 故事的稳定身份。
// railLabel = timeline-rail.json milestone.label；eventTitle = 故事 event.title。
// story_015 的 rail label「绝妙好辞」≠ event title「杨修绝妙好辞」。
const STORIES_199 = [
  { storyId: "story_004_zhu_jiu_lun_ying_xiong", railLabel: "曹操煮酒论英雄", eventTitle: "曹操煮酒论英雄" },
  { storyId: "story_005_wang_mei_zhi_ke", railLabel: "望梅止渴", eventTitle: "望梅止渴" },
  { storyId: "story_015_yang_xiu_jue_miao_hao_ci", railLabel: "绝妙好辞", eventTitle: "杨修绝妙好辞" },
];

test("真实数据确实包含三个 199 CE 故事，且 story_id 各不相同", () => {
  const year199 = entries.filter((e) => e.story.timeline.year === 199);
  assert.equal(year199.length, 3, "应有恰好三个 199 年故事");
  const ids = new Set(year199.map((e) => e.story.story_id));
  assert.equal(ids.size, 3, "三个 199 故事 story_id 必须互不相同");
  for (const { storyId } of STORIES_199) {
    assert.ok(ids.has(storyId), `缺失 ${storyId}`);
  }
});

test("按 story_id 选择故事：三个 199 故事互不串线", () => {
  // 控制组：旧按年 find 永远返回第一条（story_004）——证明 bug 真实存在
  const byYear = entries.find((e) => e.story.timeline.year === 199);
  assert.equal(
    [0, 1, 2].map(() => entries.find((e) => e.story.timeline.year === 199).event.title)
      .every((t) => t === byYear.event.title),
    true,
    "按年选择确实会串线（控制组）",
  );

  // 期望：按 story_id 选择，三个故事各自独立
  const selected = STORIES_199.map(({ storyId, eventTitle }) => {
    const entry = selectEntryByStoryId(entries, storyId);
    assert.ok(entry, `${storyId} 必须能被选中`);
    assert.equal(entry.story.story_id, storyId, "选中的 story_id 必须与请求一致");
    assert.equal(
      entry.event.title,
      eventTitle,
      `${storyId} 标题必须是「${eventTitle}」而非串线到第一条`,
    );
    return entry.event.title;
  });

  assert.equal(new Set(selected).size, 3, "三个 199 故事标题必须互不相同（不串线）");
});

test("同年三个故事各自的 docked 里程碑唯一且对应正确 story_id", () => {
  const milestones = buildMilestones(entries, rail, "story_005_wang_mei_zhi_ke");

  const dockedFor199 = STORIES_199.map(({ storyId, railLabel }) => {
    const docked = selectMilestoneByStoryId(milestones, storyId);
    assert.ok(docked, `${storyId} 必须有对应的 docked 里程碑`);
    assert.equal(docked.story_id, storyId, "docked 里程碑 story_id 必须匹配");
    assert.equal(docked.label, railLabel, `docked 标签必须为「${railLabel}」`);
    assert.ok(milestoneInteractive(docked), `${storyId} 里程碑必须 interactive`);
    return docked;
  });

  const asJson = dockedFor199.map((m) => JSON.stringify({ id: m.story_id, label: m.label }));
  assert.equal(new Set(asJson).size, 3, "三个 docked 里程碑必须互不相同");
});

test("同年 active 高亮必须以选中 story_id 定位：选中 story_005 时仅望梅止渴 active", () => {
  const milestones = buildMilestones(entries, rail, "story_005_wang_mei_zhi_ke");
  const active199 = milestones.filter((m) => m.year === 199 && m.status === "active");
  assert.equal(active199.length, 1, "199 年只能有一个 active 节点（选中 story_id 决定）");
  assert.equal(active199[0].story_id, "story_005_wang_mei_zhi_ke", "active 节点必须是选中的 story_005");

  // 换选 story_015
  const milestones2 = buildMilestones(entries, rail, "story_015_yang_xiu_jue_miao_hao_ci");
  const active199b = milestones2.filter((m) => m.year === 199 && m.status === "active");
  assert.equal(active199b.length, 1, "切换后 199 年仍只能有一个 active");
  assert.equal(active199b[0].story_id, "story_015_yang_xiu_jue_miao_hao_ci", "active 必须切到 story_015");
});

test("列表点击 / 滑块拖动 / 键盘 → onDock(milestone)：从里程碑取出 story_id 再选故事，三个独立", () => {
  const milestones = buildMilestones(entries, rail, "story_004_zhu_jiu_lun_ying_xiong");
  // 模拟 UI 把同一个 milestone 对象交给选择逻辑（列表 onClick、滑块 endDrag、键盘 Arrow）
  const picked = STORIES_199.map(({ storyId, eventTitle }) => {
    const milestone = milestones.find((m) => m.story_id === storyId);
    assert.ok(milestone, `${storyId} 里程碑必须存在于 rail`);
    const resolvedId = storyIdFromMilestone(milestone);
    assert.equal(resolvedId, storyId, "从里程碑取出的 story_id 必须与该故事一致");
    const entry = selectEntryByStoryId(entries, resolvedId);
    assert.equal(entry.event.title, eventTitle, "经由里程碑选中的故事标题必须正确，不串线");
    return entry.story.story_id;
  });
  assert.equal(new Set(picked).size, 3, "经由里程碑选择得到三个独立 story_id");
});

test("切换不同 story_id 后，被选中的故事年份随之改变（单故事行为不退化）", () => {
  const entry = selectEntryByStoryId(entries, "story_006_cao_zhi_qi_bu_cheng_shi");
  assert.equal(entry.story.story_id, "story_006_cao_zhi_qi_bu_cheng_shi");
  assert.equal(entry.story.timeline.year, 220);
  const entry2 = selectEntryByStoryId(entries, "story_005_wang_mei_zhi_ke");
  assert.equal(entry2.story.timeline.year, 199);
  assert.equal(entry2.event.title, "望梅止渴");
});

test("selectEntryByStoryId 对未知 story_id 安全回退到首条（不崩）", () => {
  const entry = selectEntryByStoryId(entries, "story_does_not_exist");
  assert.ok(entry, "未知 story_id 应回退而非返回 undefined");
});

test("region preview / planned 里程碑行为不被破坏：planned 里程碑无 story_id 不硬造关联", () => {
  const milestones = buildMilestones(entries, rail, "story_005_wang_mei_zhi_ke");
  const planned = milestones.find((m) => !m.interactive);
  assert.ok(planned, "rail 中仍应存在 planned 里程碑");
  assert.equal(storyIdFromMilestone(planned), null, "planned 里程碑不得伪造 story_id");
});
