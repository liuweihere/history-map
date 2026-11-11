// Phase 0 RED→GREEN test: 时间轴键盘导航不得卡在 planned 节点。
//
// 验收项（PLAN.md V3 §5 / §8 morning report「键盘时间轴」FAIL）：
// 方向键在相邻 planned 节点处不卡死——键盘导航到 planned 里程碑时游标前进，
// interactive 节点照常 dock 选故事。
//
// 本测试分两层：
// 1) 纯逻辑层（dockAction / resolveCursor）——证明导航决策正确；
// 2) React 集成层（jsdom + react-dom/client + tsx）——挂载真实 TimeScrubber
//    + 复刻 HistoryAtlasApp 的游标管理逻辑，派发连续 keydown，断言
//    aria-valuenow 实际前进（覆盖父组件忽略 planned 的缺陷）。
//
// fixture：项羽乌江自刎(story_000, -202 BCE) 后一条是 汉朝建立(planned)；
// 蔡伦造纸(story_001, 105 CE) 后一条是 江南可采莲(planned)——真实数据中
// interactive→planned 相邻边界，覆盖用户初始故事（项羽）相邻 planned。

import { test } from "node:test";
import assert from "node:assert/strict";

import { getChronicleData } from "../lib/history-data.js";
import {
  buildMilestones,
  selectMilestoneByStoryId,
  milestoneInteractive,
  storyIdFromMilestone,
} from "../lib/story-selection.js";

const { entries, timeline } = await getChronicleData();
const rail = timeline?.milestones ?? [];

// 项羽乌江自刎 → 汉朝建立(planned)：真实 interactive→planned 边界
const DOCKED_STORY = "story_000_xiang_yu_wujiang";

// ---------------------------------------------------------------------------
// 第一层：纯逻辑——dockAction 决定键盘到达一个里程碑后该做什么。
// ---------------------------------------------------------------------------

test("dockAction 对 interactive 里程碑返回 select-story（不退化）", async () => {
  const { dockAction } = await import("../lib/story-selection.js");
  const milestones = buildMilestones(entries, rail, DOCKED_STORY);
  const docked = selectMilestoneByStoryId(milestones, DOCKED_STORY);
  const action = dockAction(docked);
  assert.equal(action.type, "select-story");
  assert.equal(action.storyId, DOCKED_STORY);
});

test("dockAction 对 planned 里程碑返回 advance-cursor（不卡死）", async () => {
  const { dockAction } = await import("../lib/story-selection.js");
  const milestones = buildMilestones(entries, rail, DOCKED_STORY);
  const docked = selectMilestoneByStoryId(milestones, DOCKED_STORY);
  const dockedIndex = milestones.indexOf(docked);
  const next = milestones[dockedIndex + 1];
  assert.ok(next, "应存在下一个里程碑");
  assert.equal(milestoneInteractive(next), false, "下一个里程碑应为 planned（不可交互）");

  const action = dockAction(next);
  assert.equal(action.type, "advance-cursor", "planned 节点必须前进游标，不能忽略（卡死）");
  assert.equal(action.milestoneId, next.milestone_id, "游标目标 milestone_id 必须匹配");
  assert.ok("regionId" in action, "advance-cursor 必须携带 regionId 字段");
});

test("dockAction 对 planned 带 regionId 的里程碑返回 regionId 供大区预览", async () => {
  const { dockAction } = await import("../lib/story-selection.js");
  const milestones = buildMilestones(entries, rail, DOCKED_STORY);
  const plannedWithRegion = milestones.find((m) => !m.interactive && m.regionId);
  if (!plannedWithRegion) return; // 当前数据可能没有；跳过不失败
  const action = dockAction(plannedWithRegion);
  assert.equal(action.type, "advance-cursor");
  assert.equal(action.regionId, plannedWithRegion.regionId);
});

test("resolveCursor：有 cursorId 时返回游标里程碑，否则回退到 docked", async () => {
  const { resolveCursor } = await import("../lib/story-selection.js");
  const milestones = buildMilestones(entries, rail, DOCKED_STORY);
  const docked = selectMilestoneByStoryId(milestones, DOCKED_STORY);
  const fallback = resolveCursor(milestones, null, docked);
  assert.equal(fallback, docked, "无 cursor 时应回退到 docked");
  const dockedIndex = milestones.indexOf(docked);
  const planned = milestones[dockedIndex + 1];
  const cursor = resolveCursor(milestones, planned.milestone_id, docked);
  assert.equal(cursor, planned, "有 cursor 时应返回游标里程碑");
  assert.equal(milestoneInteractive(cursor), false, "游标可指向 planned 节点");
});

test("resolveCursor 对未知 cursorId 安全回退到 docked", async () => {
  const { resolveCursor } = await import("../lib/story-selection.js");
  const milestones = buildMilestones(entries, rail, DOCKED_STORY);
  const docked = selectMilestoneByStoryId(milestones, DOCKED_STORY);
  const cursor = resolveCursor(milestones, "ms_nonexistent", docked);
  assert.equal(cursor, docked, "未知 cursorId 应回退到 docked");
});

test("键盘从 interactive 节点经 planned 节点连续前进不卡死（端到端逻辑）", async () => {
  const { dockAction, resolveCursor } = await import("../lib/story-selection.js");
  const milestones = buildMilestones(entries, rail, DOCKED_STORY);
  let docked = selectMilestoneByStoryId(milestones, DOCKED_STORY);
  let cursorId = null;
  let advanced = false;
  for (let step = 0; step < 15; step++) {
    const cursor = resolveCursor(milestones, cursorId, docked);
    const idx = milestones.indexOf(cursor);
    const next = milestones[idx + 1];
    if (!next) break;
    const action = dockAction(next);
    if (action.type === "advance-cursor") {
      cursorId = action.milestoneId;
      advanced = true;
    } else if (action.type === "select-story") {
      cursorId = null;
      const newDocked = milestones.find((m) => m.story_id === action.storyId);
      if (newDocked) docked = newDocked;
      break;
    }
  }
  assert.ok(advanced, "必须至少经过一个 planned 节点（证明不卡死）");
});

// ---------------------------------------------------------------------------
// 第二层：React 集成——挂载真实 TimeScrubber + 游标管理逻辑，
// 派发连续 keydown，断言 aria-valuenow 实际前进。
// ---------------------------------------------------------------------------

async function setupJsdom() {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const props = {
    window: { value: dom.window, writable: true, configurable: true },
    document: { value: dom.window.document, writable: true, configurable: true },
    HTMLElement: { value: dom.window.HTMLElement, writable: true, configurable: true },
    getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), writable: true, configurable: true },
  };
  for (const [key, desc] of Object.entries(props)) {
    Object.defineProperty(globalThis, key, desc);
  }
  try {
    Object.defineProperty(globalThis, "navigator", {
      value: dom.window.navigator, writable: true, configurable: true,
    });
  } catch { /* Node 22+ navigator 只读，React 19 不强依赖 */ }
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  // React 19 act 环境标记：让 act() 同步冲刷 render/effect 队列，
  // 消除「固定 sleep 等状态提交」的时序依赖（并发全量跑时的 flake 根因）。
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!dom.window.HTMLCanvasElement.prototype.getContext) {
    dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  }
  return dom;
}

// 复刻 HistoryAtlasApp 的游标管理逻辑（从 story-selection.js 导入 dockAction /
// resolveCursor），用 React state 驱动。证明父组件不再忽略 planned 节点。
async function createTestApp(milestones, initialStoryId) {
  const React = await import("react");
  const { createElement, useState, useEffect } = React;
  const { TimeScrubber } = await import("../components/time-scrubber.jsx");
  const { dockAction, resolveCursor } = await import("../lib/story-selection.js");

  function TestApp() {
    const [selectedStoryId, setSelectedStoryId] = useState(initialStoryId);
    const [cursorMilestoneId, setCursorMilestoneId] = useState(null);

    // 选中故事变化时重置游标（与 HistoryAtlasApp 一致）
    useEffect(() => {
      setCursorMilestoneId(null);
    }, [selectedStoryId]);

    const docked = selectMilestoneByStoryId(milestones, selectedStoryId);
    const cursor = resolveCursor(milestones, cursorMilestoneId, docked);

    const dockToMilestone = (milestone) => {
      const action = dockAction(milestone);
      if (action.type === "select-story") {
        setSelectedStoryId(action.storyId);
        setCursorMilestoneId(null);
      } else if (action.type === "advance-cursor") {
        setCursorMilestoneId(action.milestoneId);
      }
    };

    return createElement(TimeScrubber, {
      milestones,
      docked,
      cursor,
      onDock: dockToMilestone,
      onYearChange: () => {},
    });
  }
  return { TestApp, createElement };
}

async function mountApp(milestones, initialStoryId) {
  await setupJsdom();
  const React = await import("react");
  const act = React.act;
  const { createRoot } = await import("react-dom/client");
  const { TestApp, createElement } = await createTestApp(milestones, initialStoryId);
  const container = document.getElementById("root");
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(TestApp));
  });
  return { root, container, act };
}

// 每次派发前重新查询 slider：React 重渲染可能替换 DOM 节点，
// 缓存旧引用会把键盘事件派发到已分离的节点上（事件丢失，不是时序慢）。
async function pressKey(act, key) {
  const slider = document.querySelector('[role="slider"]');
  assert.ok(slider, "slider 元素必须存在（每次按键前重新查询）");
  slider.focus();
  await act(async () => {
    slider.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function getAriaValueNow() {
  const slider = document.querySelector('[role="slider"]');
  return slider ? Number(slider.getAttribute("aria-valuenow")) : null;
}

test("React 集成：连续 ArrowRight 经 planned 节点后 aria-valuenow 前进（不卡死）", async () => {
  const milestones = buildMilestones(entries, rail, DOCKED_STORY);
  const docked = selectMilestoneByStoryId(milestones, DOCKED_STORY);
  const dockedIndex = milestones.indexOf(docked);
  const next = milestones[dockedIndex + 1];
  assert.equal(milestoneInteractive(next), false, "下一个里程碑应为 planned");

  const { act } = await mountApp(milestones, DOCKED_STORY);

  assert.ok(document.querySelector('[role="slider"]'), "slider 元素必须存在");

  const before = getAriaValueNow();
  assert.equal(before, dockedIndex, `初始 aria-valuenow 应为 ${dockedIndex}`);

  // 第一次 ArrowRight → 到达 planned 节点（汉朝建立）。
  // act 同步冲刷：派发返回时状态已提交，无需 sleep/轮询（并发全量跑亦确定性）。
  await pressKey(act, "ArrowRight");
  const after1 = getAriaValueNow();
  assert.equal(after1, dockedIndex + 1, "ArrowRight 后 aria-valuenow 必须前进到 planned 节点（不卡死）");

  // 第二次 ArrowRight → 继续前进（证明不卡在 planned）
  await pressKey(act, "ArrowRight");
  const after2 = getAriaValueNow();
  assert.ok(after2 > dockedIndex + 1 || after2 === milestones.length - 1,
    `第二次 ArrowRight 后 aria-valuenow 必须继续前进（${after2} > ${dockedIndex + 1}），不卡在 planned`);
});

test("React 集成：ArrowLeft 连续按到 index 0 后不越界（卡在 0）", async () => {
  const milestones = buildMilestones(entries, rail, DOCKED_STORY);
  const firstInteractive = milestones.find((m) => m.interactive);
  const firstStoryId = storyIdFromMilestone(firstInteractive);

  const { act } = await mountApp(milestones, firstStoryId);
  assert.ok(document.querySelector('[role="slider"]'));

  // 连续按左直到 index 0（经过 planned 节点）
  for (let i = 0; i < milestones.length + 5; i++) {
    await pressKey(act, "ArrowLeft");
  }
  const after = getAriaValueNow();
  assert.equal(after, 0, `ArrowLeft 连续后必须停在 index 0（不越界），实际 ${after}`);
});

test("React 集成：ArrowRight 连续按到末节点后不越界（卡在末尾）", async () => {
  const milestones = buildMilestones(entries, rail, DOCKED_STORY);
  const lastInteractive = [...milestones].reverse().find((m) => m.interactive);
  const lastStoryId = storyIdFromMilestone(lastInteractive);

  const { act } = await mountApp(milestones, lastStoryId);
  assert.ok(document.querySelector('[role="slider"]'));

  // 连续按右直到末尾（经过 planned 节点）
  for (let i = 0; i < milestones.length + 5; i++) {
    await pressKey(act, "ArrowRight");
  }
  const after = getAriaValueNow();
  assert.equal(after, milestones.length - 1, `ArrowRight 连续后必须停在末节点（${milestones.length - 1}），实际 ${after}`);
});
