// Phase 0 RED→GREEN test: milestone_id 持久性 + 导出校验（真实生产解析函数）。
//
// 验收项（PLAN.md V3 §5/§7/§8 决策包②）：
// - 修改标题、年份与重排不改变 milestone_id 身份（ID 从源列读取，非内容派生）。
// - 缺失 milestone_id 真实报错（清楚列出冲突行）。
// - 重复 milestone_id 真实报错（清楚列出冲突行）。
// - 旧 story_id 行为不破坏。
//
// 测试直接调用生产解析函数 buildTimelineMilestones（wiki/scripts/
// timeline-milestone-parser.mjs），与 export-history-data.ts 共用同一函数。

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimelineMilestones } from "../../wiki/scripts/timeline-milestone-parser.mjs";

function makeRow(overrides = {}) {
  return {
    年份: "-202",
    时代: "楚汉相争",
    事件: "项羽乌江自刎",
    时间轴提示: "节点零",
    地图变化: "退路越收越窄",
    结果: "项羽自刎",
    孩子要理解: "英雄的结束",
    故事状态: "recorded",
    story_id: "story_000_xiang_yu_wujiang",
    milestone_id: "ms_050",
    ...overrides,
  };
}

test("修改标题后 milestone_id 不变（持久身份）", () => {
  const rows = [makeRow({ 事件: "项羽之死" })];
  const ms = buildTimelineMilestones(rows, new Map());
  assert.equal(ms[0].milestone_id, "ms_050");
  assert.equal(ms[0].label, "项羽之死", "标题应更新");
  assert.equal(ms[0].year, -202, "年份不变");
});

test("修改年份后 milestone_id 不变（持久身份）", () => {
  const rows = [makeRow({ 年份: "-201" })];
  const ms = buildTimelineMilestones(rows, new Map());
  assert.equal(ms[0].milestone_id, "ms_050");
  assert.equal(ms[0].year, -201, "年份应更新");
});

test("重排后 milestone_id 跟随行内容（不因位置变化）", () => {
  const rowA = makeRow({ milestone_id: "ms_050", 事件: "项羽" });
  const rowB = makeRow({ milestone_id: "ms_051", 年份: "-200", 事件: "汉朝建立", story_id: "", 故事状态: "planned" });
  // 交换顺序
  const ms = buildTimelineMilestones([rowB, rowA], new Map());
  assert.equal(ms[0].milestone_id, "ms_051", "第一行 ID 应为 ms_051");
  assert.equal(ms[1].milestone_id, "ms_050", "第二行 ID 应为 ms_050");
});

test("缺失 milestone_id 真实报错（清楚列出冲突行）", () => {
  const rows = [makeRow({ milestone_id: "" })];
  assert.throws(
    () => buildTimelineMilestones(rows, new Map()),
    /缺少 milestone_id/,
  );
});

test("缺失 milestone_id 列报错", () => {
  const row = makeRow();
  delete row.milestone_id;
  assert.throws(
    () => buildTimelineMilestones([row], new Map()),
    /缺少 milestone_id/,
  );
});

test("重复 milestone_id 真实报错（清楚列出冲突行）", () => {
  const rows = [
    makeRow({ milestone_id: "ms_001", 事件: "项羽" }),
    makeRow({ milestone_id: "ms_001", 年份: "-200", 事件: "汉朝建立", story_id: "" }),
  ];
  assert.throws(
    () => buildTimelineMilestones(rows, new Map()),
    /重复/,
  );
});

test("多个重复 milestone_id 报错列出所有冲突", () => {
  const rows = [
    makeRow({ milestone_id: "ms_001" }),
    makeRow({ milestone_id: "ms_001", 年份: "-200", 事件: "汉朝", story_id: "" }),
    makeRow({ milestone_id: "ms_002", 年份: "-200", 事件: "白登", story_id: "" }),
    makeRow({ milestone_id: "ms_002", 年份: "-180", 事件: "吕后", story_id: "" }),
  ];
  assert.throws(
    () => buildTimelineMilestones(rows, new Map()),
    /ms_001.*重复.*ms_002.*重复|ms_002.*重复.*ms_001.*重复/s,
  );
});

test("空表格报错", () => {
  assert.throws(
    () => buildTimelineMilestones([], new Map()),
    /为空/,
  );
});

test("story_id 正确映射到 narration_status", () => {
  const narration = new Map([["story_000_xiang_yu_wujiang", "placeholder"]]);
  const rows = [makeRow()];
  const ms = buildTimelineMilestones(rows, narration);
  assert.equal(ms[0].narration_status, "placeholder");
});

test("planned 节点（无 story_id）narration_status 为 unknown", () => {
  const rows = [makeRow({ story_id: "", 故事状态: "planned", milestone_id: "ms_051" })];
  const ms = buildTimelineMilestones(rows, new Map());
  assert.equal(ms[0].story_id, null);
  assert.equal(ms[0].narration_status, "unknown");
});

test("render_key 等于 milestone_id（全部唯一）", () => {
  const rows = [
    makeRow({ milestone_id: "ms_001" }),
    makeRow({ milestone_id: "ms_002", 年份: "-200", 事件: "汉朝", story_id: "" }),
  ];
  const ms = buildTimelineMilestones(rows, new Map());
  assert.equal(ms[0].render_key, "ms_001");
  assert.equal(ms[1].render_key, "ms_002");
});

test("wiki 链接别名正确解析（stripWikiMarkup 语义完整）", () => {
  const rows = [makeRow({ 事件: "[[项羽|项王]]乌江自刎", 时代: "[[楚汉相争]]" })];
  const ms = buildTimelineMilestones(rows, new Map());
  assert.equal(ms[0].label, "项王乌江自刎", "链接别名应被解析");
  assert.equal(ms[0].period, "楚汉相争", "无别名链接解析为目标");
});

test("buildTimelineMilestones 是 export-history-data.ts 使用的同一生产函数", async () => {
  // 验证 export-history-data.ts 导入了 buildTimelineMilestones
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const exportScript = await readFile(
    path.join(process.cwd(), "..", "wiki", "scripts", "export-history-data.ts"),
    "utf8",
  );
  assert.ok(
    exportScript.includes("buildTimelineMilestones") &&
      exportScript.includes("timeline-milestone-parser.mjs"),
    "export-history-data.ts 必须导入并使用 buildTimelineMilestones",
  );
});
