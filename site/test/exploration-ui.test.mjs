// Phase 3 · 探索 UI 渲染测试（jsdom + tsx + react-dom）。
//
// 验收项（PLAN.md V3 §2/§5）：
// - 右侧抽屉默认收起、展开后双标签（我们的故事 / 重大事件）仅当前朝代；
// - 空列表显示「这个朝代的故事还在准备中」；
// - 重大事件突出所选年份、有审定关联才显示「查看相关故事」、无坐标仅显示文字；
// - 底部朝代比例时间轴渲染朝代段、当前年份指针、上/下一年按钮；
// - 数据缺失（index fetch 失败）显示友好提示且保留故事入口（不锁死）。
//
// 使用 mock 数据（不依赖 Phase 1 适配器产物），maplibre 不挂载（jsdom 无 WebGL）。
// 运行：node --import tsx --test test/exploration-ui.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

// ── jsdom 环境 ────────────────────────────────────────────────────
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
  // 记录原始值，测试后恢复，避免污染同进程后续测试文件（keyboard-navigation 等）
  if (!globalThis.__origGlobals) {
    globalThis.__origGlobals = {
      window: globalThis.window,
      document: globalThis.document,
      HTMLElement: globalThis.HTMLElement,
      getComputedStyle: globalThis.getComputedStyle,
      navigator: globalThis.navigator,
      requestAnimationFrame: globalThis.requestAnimationFrame,
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
    };
  }
  for (const [key, desc] of Object.entries(props)) {
    Object.defineProperty(globalThis, key, desc);
  }
  try {
    Object.defineProperty(globalThis, "navigator", {
      value: dom.window.navigator, writable: true, configurable: true,
    });
  } catch { /* Node 22+ navigator 只读 */ }
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  if (!dom.window.HTMLCanvasElement.prototype.getContext) {
    dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  }
  return dom;
}

// 测试结束后恢复全局，避免污染同进程其它测试文件（默认隔离为 shared 时）
import { after } from "node:test";
after(() => {
  const o = globalThis.__origGlobals;
  if (!o) return;
  try {
    Object.defineProperty(globalThis, "window", { value: o.window, writable: true, configurable: true });
    Object.defineProperty(globalThis, "document", { value: o.document, writable: true, configurable: true });
    Object.defineProperty(globalThis, "HTMLElement", { value: o.HTMLElement, writable: true, configurable: true });
    Object.defineProperty(globalThis, "getComputedStyle", { value: o.getComputedStyle, writable: true, configurable: true });
    globalThis.navigator = o.navigator;
    globalThis.requestAnimationFrame = o.requestAnimationFrame;
    globalThis.cancelAnimationFrame = o.cancelAnimationFrame;
  } catch { /* best-effort */ }
  delete globalThis.__origGlobals;
});

async function render(jsx) {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const dom = await setupJsdom();
  const root = createRoot(document.getElementById("root"));
  await new Promise((resolve) => {
    root.render(jsx);
    setTimeout(resolve, 30);
  });
  return { root, document, React };
}

// ── mock 数据 ─────────────────────────────────────────────────────
const MOCK_INDEX = {
  dynasties: [
    { key: "chuhan", title: "楚汉相争", from: -203, to: -202, phases: [
      { snapshot: "chuhan", from: -203, to: -202, file: "snapshots/chuhan.geojson", overview: "楚汉" },
    ] },
    { key: "sanguo", title: "三国", from: 220, to: 265, phases: [
      { snapshot: "sanguo", from: 220, to: 265, file: "snapshots/sanguo.geojson", overview: "三国鼎立" },
    ] },
  ],
};

const MOCK_STORIES = [
  { story: { story_id: "story_000", timeline: { year: -202 } }, event: { title: "项羽乌江自刎" } },
];

const MOCK_MILESTONES = {
  features: [
    { geometry: { type: "Point", coordinates: [110, 30] }, properties: { dynasty: "chuhan", year: -202, headline: "项羽乌江", site: "乌江", source_key: "sk_001" } },
    { geometry: null, properties: { dynasty: "chuhan", year: -203, headline: "楚汉开战", site: "荥阳", source_key: "sk_002" } },
    { geometry: null, properties: { dynasty: "sanguo", year: 220, headline: "三国鼎立", site: "洛阳", source_key: "sk_003" } },
  ],
};

const MOCK_BRIDGE = { entries: [
  { source_key: "sk_001", story_ids: ["story_000"], status: "approved" },
  { source_key: "sk_002", story_ids: ["story_x"], status: "proposed" }, // 未批准不显示
] };

// ── ExplorationDrawer 测试 ────────────────────────────────────────

test("抽屉默认收起：不渲染标签内容，但入口可见", async () => {
  const { createElement } = await import("react");
  const { ExplorationDrawer } = await import("../components/exploration-drawer.jsx");
  const { document } = await render(
    createElement(ExplorationDrawer, {
      open: false,
      onToggle: () => {},
      tab: "stories",
      onTabChange: () => {},
      dynasty: MOCK_INDEX.dynasties[0],
      dynastyStories: MOCK_STORIES,
      dynastyMilestones: [],
      selectedYear: -202,
      bridge: MOCK_BRIDGE,
      onSelectStory: () => {},
      onSelectYear: () => {},
      onFocusSite: () => {},
    }),
  );
  assert.ok(document.querySelector(".exploration-drawer__toggle"), "收起时入口按钮可见");
  assert.ok(!document.querySelector(".exploration-drawer__body"), "收起时不渲染内容");
});

test("抽屉展开后双标签：默认「我们的故事」，另一标签「重大事件」", async () => {
  const { createElement } = await import("react");
  const { ExplorationDrawer } = await import("../components/exploration-drawer.jsx");
  const { document } = await render(
    createElement(ExplorationDrawer, {
      open: true,
      onToggle: () => {},
      tab: "stories",
      onTabChange: () => {},
      dynasty: MOCK_INDEX.dynasties[0],
      dynastyStories: MOCK_STORIES,
      dynastyMilestones: [],
      selectedYear: -202,
      bridge: MOCK_BRIDGE,
      onSelectStory: () => {},
      onSelectYear: () => {},
      onFocusSite: () => {},
    }),
  );
  const tabs = [...document.querySelectorAll(".exploration-drawer__tab")].map((t) => t.textContent.trim());
  assert.deepEqual(tabs, ["我们的故事", "重大事件"]);
  assert.ok(document.querySelector(".exploration-drawer__tab.is-active"), "有激活标签");
});

test("空故事列表显示「这个朝代的故事还在准备中」", async () => {
  const { createElement } = await import("react");
  const { ExplorationDrawer } = await import("../components/exploration-drawer.jsx");
  const { document } = await render(
    createElement(ExplorationDrawer, {
      open: true,
      onToggle: () => {},
      tab: "stories",
      onTabChange: () => {},
      dynasty: MOCK_INDEX.dynasties[0],
      dynastyStories: [],
      dynastyMilestones: [],
      selectedYear: -202,
      bridge: MOCK_BRIDGE,
      onSelectStory: () => {},
      onSelectYear: () => {},
      onFocusSite: () => {},
    }),
  );
  const empty = document.querySelector(".exploration-empty");
  assert.ok(empty, "空态元素存在");
  assert.match(empty.textContent, /还在准备中/);
});

test("重大事件：突出所选年份、有审定关联才显示查看相关故事、无坐标仅显示文字", async () => {
  const { createElement } = await import("react");
  const { ExplorationDrawer } = await import("../components/exploration-drawer.jsx");
  const chuMilestones = MOCK_MILESTONES.features.filter((f) => f.properties.dynasty === "chuhan");
  const { document } = await render(
    createElement(ExplorationDrawer, {
      open: true,
      onToggle: () => {},
      tab: "events",
      onTabChange: () => {},
      dynasty: MOCK_INDEX.dynasties[0],
      dynastyStories: MOCK_STORIES,
      dynastyMilestones: chuMilestones,
      selectedYear: -202,
      bridge: MOCK_BRIDGE,
      onSelectStory: () => {},
      onSelectYear: () => {},
      onFocusSite: () => {},
    }),
  );
  // 所选年份 -202 高亮
  const current = document.querySelector(".exploration-event-list__item.is-current");
  assert.ok(current, "所选年份事件高亮");
  assert.match(current.textContent, /项羽乌江/);
  // sk_001 有 approved 桥接 → 显示查看相关故事
  assert.ok(document.querySelector(".exploration-event-list__link"), "有审定关联显示查看相关故事");
  // sk_002 proposed 不显示链接；且 sk_002 无坐标 → 仅显示文字
  const noCoordItem = [...document.querySelectorAll(".exploration-event-list__item")]
    .find((li) => li.textContent.includes("楚汉开战"));
  assert.ok(noCoordItem, "无坐标事件仍显示文字");
  assert.ok(noCoordItem.textContent.includes("无坐标"), "无坐标事件标注");
  // sk_002 proposed 不应有链接
  const links = [...document.querySelectorAll(".exploration-event-list__link")].map((l) => l.textContent);
  assert.equal(links.length, 1, "只有一个 approved 链接（proposed 不显示）");
});

// ── DynastyTimeline 测试 ──────────────────────────────────────────

test("朝代时间轴渲染朝代段、当前年份指针、上下一年按钮", async () => {
  const { createElement } = await import("react");
  const { DynastyTimeline } = await import("../components/dynasty-timeline.jsx");
  const { document } = await render(
    createElement(DynastyTimeline, {
      index: MOCK_INDEX,
      selectedYear: 220,
      onYearChange: () => {},
      onPhaseStep: () => {},
    }),
  );
  assert.ok(document.querySelector(".dynasty-timeline__track"), "轨道存在");
  assert.ok(document.querySelector(".dynasty-timeline__pin"), "当前年份指针存在");
  assert.ok(document.querySelector(".dynasty-timeline__flag").textContent.includes("220"), "年份气泡显示 220");
  const segs = [...document.querySelectorAll(".dynasty-timeline__seg")];
  assert.equal(segs.length, 2, "两个朝代段");
  // 上一年 / 下一年按钮
  const btns = [...document.querySelectorAll(".dynasty-timeline__btn")].map((b) => b.textContent.trim());
  assert.ok(btns.some((t) => t.includes("年")), "有年份切换按钮");
});

test("年份输入超界显示范围错误，不静默 clamp（PLAN §3）", async () => {
  const { createElement } = await import("react");
  const { DynastyTimeline } = await import("../components/dynasty-timeline.jsx");
  let changedYear = null;
  const { document } = await render(
    createElement(DynastyTimeline, {
      index: MOCK_INDEX,
      selectedYear: 220,
      onYearChange: (y) => { changedYear = y; },
      onPhaseStep: () => {},
    }),
  );
  const win = document.defaultView;
  const input = document.querySelector(".dynasty-timeline__input");
  // React 19 controlled input：需先重置 valueTracker 再用原生 setter，onChange 才会触发
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
  if (input._valueTracker) input._valueTracker.setValue("");
  setter.call(input, "5000");
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  const goBtn = document.querySelector(".dynasty-timeline__go");
  goBtn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  // §3 关键验收：超界/非法年份不得静默 clamp 触发 onYearChange
  assert.equal(changedYear, null, "超界年份不应触发 onYearChange（不静默 clamp）");
  // 应显示某种输入错误（具体「超出范围」文案由 jiangshan-time.test.mjs 单元覆盖；
  // jsdom 下 React 19 受控 input valueTracker 限制，此处只断言错误状态出现）
  const err = document.querySelector(".dynasty-timeline__input-error");
  assert.ok(err, "输入非法时应显示错误提示（不静默成功）");
});

// ── ExplorationStage 数据缺失友好提示（mock fetch 失败）────────────

test("index fetch 失败时显示友好提示，不锁死（保留故事入口由父级按钮）", async () => {
  const { createElement } = await import("react");
  const { ExplorationStage } = await import("../components/exploration-stage.jsx");
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("no jiangshan data"));
  try {
    const { document } = await render(
      createElement(ExplorationStage, {
        entries: MOCK_STORIES,
        onEnterStory: () => {},
        onStateChange: () => {},
      }),
    );
    await new Promise((r) => setTimeout(r, 120));
    const card = document.querySelector(".exploration-empty-stage__card");
    assert.ok(card, "数据缺失显示友好提示卡");
    assert.match(card.textContent, /历史地图数据还在准备中/);
  } finally {
    globalThis.fetch = origFetch;
  }
});
