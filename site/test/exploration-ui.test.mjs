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
  // maplibre 模块加载需要 URL.createObjectURL（jsdom 缺失会抛错）；stub 以避免
  // 异步泄漏。Map 构造仍会因无 WebGL 失败，由组件 init().catch 承载。
  if (!dom.window.URL.createObjectURL) {
    dom.window.URL.createObjectURL = () => "blob:fake";
    dom.window.URL.revokeObjectURL = () => {};
  }
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => "blob:fake";
    globalThis.URL.revokeObjectURL = () => {};
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
    { key: "chuhan", title: "楚汉相争", tint: "#7a4a3a", from: -203, to: -202, phases: [
      { snapshot: "chuhan", from: -203, to: -202, file: "snapshots/chuhan.geojson", overview: "楚汉" },
    ] },
    { key: "sanguo", title: "三国", tint: "#4a6fa5", from: 220, to: 265, phases: [
      { snapshot: "sanguo", from: 220, to: 240, file: "snapshots/sanguo.geojson", overview: "三国鼎立" },
      { snapshot: "sanguo_b", from: 241, to: 265, file: "snapshots/sanguo_b.geojson", overview: "三家归晋前夜" },
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

// ── DynastyTimeline 测试（江山时序上游原样布局，PLAN §2）─────────────────
//
// 上游对照（jiangshan-map index.html #scrubber-dock / css .band-cell）：
// - 朝代色带：background = 该朝代 tint（不是统一淡色）；
// - 当前朝代 is-active；年份气泡在轨道上方；4px 竖条手柄；
// - 带内阶段刻度（phases>1 时）与里程碑事件点（milestones prop）；
// - 点击/回车朝代带 → 跳到该朝代起始年。

test("朝代时间轴：色带用各朝代 tint、当前朝代 is-active、气泡显示年份与朝代", async () => {
  const { createElement } = await import("react");
  const { DynastyTimeline } = await import("../components/dynasty-timeline.jsx");
  const { document } = await render(
    createElement(DynastyTimeline, {
      index: MOCK_INDEX,
      milestones: MOCK_MILESTONES,
      selectedYear: 220,
      onYearChange: () => {},
      onPhaseStep: () => {},
    }),
  );
  assert.ok(document.querySelector(".dynasty-timeline__track"), "轨道存在");
  const bands = [...document.querySelectorAll(".dynasty-timeline__band")];
  assert.equal(bands.length, 2, "两个朝代色带");
  assert.equal(bands[0].style.background, "rgb(122, 74, 58)", "楚汉带用自身 tint（非统一淡色）");
  assert.equal(bands[1].style.background, "rgb(74, 111, 165)", "三国带用自身 tint");
  // 当前年 220 → 三国带 is-active
  assert.ok(bands[1].classList.contains("is-active"), "当前朝代带 is-active");
  assert.ok(!bands[0].classList.contains("is-active"), "非当前朝代不带 is-active");
  // 气泡：年份 + 朝代名（上游「公元前403年 · 周威烈王二十三年」对应结构）
  const bubble = document.querySelector(".dynasty-timeline__bubble");
  assert.ok(bubble, "年份气泡存在");
  assert.ok(bubble.textContent.includes("220"), "气泡含年份");
  assert.ok(bubble.textContent.includes("三国"), "气泡含朝代名");
  // 4px 竖条手柄
  assert.ok(document.querySelector(".dynasty-timeline__handle"), "竖条手柄存在");
  // 上/下一年按钮保留
  const btns = [...document.querySelectorAll(".dynasty-timeline__btn")].map((b) => b.textContent.trim());
  assert.ok(btns.some((t) => t.includes("年")), "有年份切换按钮");
});

test("朝代时间轴：带内阶段刻度与事件点（milestones prop）", async () => {
  const { createElement } = await import("react");
  const { DynastyTimeline } = await import("../components/dynasty-timeline.jsx");
  const { document } = await render(
    createElement(DynastyTimeline, {
      index: MOCK_INDEX,
      milestones: MOCK_MILESTONES,
      selectedYear: 220,
      onYearChange: () => {},
      onPhaseStep: () => {},
    }),
  );
  // 三国 mock 有 2 个 phase → 1 条阶段刻度；楚汉单 phase → 0 条
  const phaseTicks = [...document.querySelectorAll(".dynasty-timeline__phase-tick")];
  assert.equal(phaseTicks.length, 1, "phases>1 的朝代带渲染阶段刻度");
  // 事件点：楚汉 2 条（-203/-202，pct 3 与 97 不撞）+ 三国 1 条（220 → clamp 3）= 3
  const dots = [...document.querySelectorAll(".dynasty-timeline__ev-dot")];
  assert.equal(dots.length, 3, "里程碑事件点按朝代归入色带");
});

test("朝代时间轴：点击朝代带跳到该朝代起始年", async () => {
  const { createElement } = await import("react");
  const { DynastyTimeline } = await import("../components/dynasty-timeline.jsx");
  let jumped = null;
  const { document } = await render(
    createElement(DynastyTimeline, {
      index: MOCK_INDEX,
      milestones: MOCK_MILESTONES,
      selectedYear: 220,
      onYearChange: (y) => { jumped = y; },
      onPhaseStep: () => {},
    }),
  );
  const win = document.defaultView;
  const chuBand = document.querySelectorAll(".dynasty-timeline__band")[0];
  chuBand.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(jumped, -203, "点击楚汉带 → 跳到 from=-203（上游 focusYear ?? fromYear 语义）");
});

test("朝代时间轴：刻度行渲染各朝代起点年与末年", async () => {
  const { createElement } = await import("react");
  const { DynastyTimeline } = await import("../components/dynasty-timeline.jsx");
  const { document } = await render(
    createElement(DynastyTimeline, {
      index: MOCK_INDEX,
      milestones: MOCK_MILESTONES,
      selectedYear: 220,
      onYearChange: () => {},
      onPhaseStep: () => {},
    }),
  );
  const ticks = [...document.querySelectorAll(".dynasty-timeline__ticks span")].map((t) => t.textContent);
  assert.deepEqual(ticks, ["前203", "220", "265"], "刻度=各朝代起点+末年");
});

test("时间轴布局：globals.css 中 .dynasty-timeline 全宽底栏（grid-column 1/-1）", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const css = await readFile(
    fileURLToPath(new URL("../app/globals.css", import.meta.url)),
    "utf8",
  );
  const block = css.match(/\.dynasty-timeline\s*\{[^}]*\}/s);
  assert.ok(block, ".dynasty-timeline 规则存在");
  assert.match(block[0], /grid-column:\s*1\s*\/\s*-1/, "全宽底栏（不再局限右栏）");
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

// ── 修复回归（独立审查 5a934a4 后）────────────────────────────────

test("数据缺失首屏：空态卡含明显可发现的「进入故事目录」按钮，触发 onGoToStories", async () => {
  const { createElement } = await import("react");
  const { ExplorationStage } = await import("../components/exploration-stage.jsx");
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("no data"));
  let called = false;
  try {
    const { document } = await render(
      createElement(ExplorationStage, {
        entries: MOCK_STORIES,
        onEnterStory: () => {},
        onGoToStories: () => { called = true; },
        onStateChange: () => {},
      }),
    );
    await new Promise((r) => setTimeout(r, 120));
    const cta = document.querySelector(".exploration-empty-stage__cta");
    assert.ok(cta, "首屏无数据时有明显的故事目录入口按钮");
    assert.match(cta.textContent, /进入故事目录/);
    const win = document.defaultView;
    cta.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(called, true, "点击触发 onGoToStories");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("数据来源与示意提醒显示：江山时序 / historical-basemaps / 未经法律审核", async () => {
  // ExplorationMapStage 依赖 maplibre/WebGL（jsdom 无），直接挂载会触发
  // 异步 init 失败后 setState 泄漏。归因文案是静态 JSX，用源文件字符串断言
  // 验证存在性（构建保证 JSX 语法正确）。
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const src = await readFile(
    fileURLToPath(new URL("../components/exploration-map-stage.jsx", import.meta.url)),
    "utf8",
  );
  assert.match(src, /江山时序/, "组件含江山时序来源标注");
  assert.match(src, /historical-basemaps/, "组件含 historical-basemaps 来源标注");
  assert.match(src, /未经法律/, "组件明确未通过法律审核");
  assert.match(src, /示意/, "组件保留示意提醒");
});

test("走廊过滤：无 from/to 的走廊一直显示（与 corridorActiveAt 一致）", async () => {
  const { corridorActiveAt } = await import("../lib/jiangshan-data.js");
  assert.ok(corridorActiveAt({ properties: {} }, 220), "无 span 一直显示");
  assert.ok(corridorActiveAt({ properties: { from: 220, to: 265 } }, 245), "在区间内显示");
  assert.ok(!corridorActiveAt({ properties: { from: 220, to: 265 } }, 300), "区间外不显示");
});

// ── 探索↔故事往返状态还原（§5 地图与状态验收）────────────────────

test("restoredState 恢复年份/抽屉/标签，onStateChange 仅在实际变化时上报", async () => {
  const { createElement } = await import("react");
  const { ExplorationStage } = await import("../components/exploration-stage.jsx");

  // mock fetch：index/corridors/milestones/bridge + 快照全部成功（jsdom 无 WebGL，
  // 地图 init 失败被组件 .catch 承载，不影响状态机验证）
  const origFetch = globalThis.fetch;
  const fetchLog = [];
  globalThis.fetch = async (url) => {
    fetchLog.push(String(url));
    const json = (body) => ({ ok: true, json: async () => body });
    if (String(url).includes("index.json")) return json(MOCK_INDEX);
    if (String(url).includes("corridors")) return json({ features: [] });
    if (String(url).includes("milestones")) return json(MOCK_MILESTONES);
    if (String(url).includes("bridge")) return json(MOCK_BRIDGE);
    return json({ features: [] }); // snapshots
  };

  const saved = { selectedYear: 245, drawerOpen: true, drawerTab: "events", camera: { zoom: 6.5, center: [110, 30] } };
  const emissions = [];

  try {
    const { document } = await render(
      createElement(ExplorationStage, {
        entries: MOCK_STORIES,
        onEnterStory: () => {},
        onStateChange: (s) => emissions.push(s),
        restoredState: saved,
      }),
    );
    await new Promise((r) => setTimeout(r, 150));

    // 1) 年份恢复：阶段卡显示恢复年份 245（sanguo 241–265 阶段）
    const body = document.body.textContent || "";
    assert.match(body, /245/, "恢复年份 245 呈现");
    assert.match(body, /三国/, "恢复到三国朝代");

    // 2) 抽屉恢复为展开 + 重大事件标签
    assert.ok(document.querySelector(".exploration-drawer__body"), "抽屉按 saved.drawerOpen=true 展开");
    const activeTab = document.querySelector(".exploration-drawer__tab.is-active");
    assert.ok(activeTab, "存在激活标签");
    assert.match(activeTab.textContent, /重大事件/, "恢复 saved.drawerTab=milestones");

    // 3) 上报的首个快照含恢复值（父级据此可再次保存现场）
    const first = emissions[0];
    assert.ok(first, "onStateChange 至少上报一次");
    assert.equal(first.selectedYear, 245);
    assert.equal(first.drawerOpen, true);
    assert.equal(first.drawerTab, "events");
    assert.deepEqual(first.camera, { zoom: 6.5, center: [110, 30] }, "camera 透传恢复值");
    // 无变化时不重复上报
    const count = emissions.length;
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(emissions.length, count, "状态未变化不重复上报");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("无 restoredState 时默认 220 年、抽屉收起（首次进入探索）", async () => {
  const { createElement } = await import("react");
  const { ExplorationStage } = await import("../components/exploration-stage.jsx");
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const json = (body) => ({ ok: true, json: async () => body });
    if (String(url).includes("index.json")) return json(MOCK_INDEX);
    if (String(url).includes("milestones")) return json(MOCK_MILESTONES);
    if (String(url).includes("bridge")) return json(MOCK_BRIDGE);
    return json({ features: [] });
  };
  try {
    const { document } = await render(
      createElement(ExplorationStage, {
        entries: MOCK_STORIES,
        onEnterStory: () => {},
        onStateChange: () => {},
      }),
    );
    await new Promise((r) => setTimeout(r, 150));
    assert.match(document.body.textContent || "", /220/, "默认年份 220");
    assert.ok(!document.querySelector(".exploration-drawer__body"), "默认抽屉收起");
  } finally {
    globalThis.fetch = origFetch;
  }
});
