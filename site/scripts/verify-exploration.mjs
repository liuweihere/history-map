// 浏览器实测驱动（overnight 协议每轮 VERIFY 用）：puppeteer-core + 系统 Chrome。
// 用法：先起本地预览（npm run build && npm run start -- -H 127.0.0.1 -p 3457），
// 再运行 node scripts/verify-exploration.mjs；截图落 /tmp/verify-*.png。
// 验证项（用户指定）：
//   1. 漫游模式默认年 220 → 三国疆域显示（snapshot 加载 + 政权标签渲染）
//   2. 拖时间轴到 -204/-206 → 楚汉并立（s_qin_chuhan 快照 + 汉/西楚标签）
//   3. 时间轴布局：全宽底栏、朝代 tint 色带、气泡、手柄
// 运行：node /tmp/verify-explore.mjs
import puppeteer from "puppeteer-core";

const BASE = "http://127.0.0.1:3457/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, pass: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--window-size=1440,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
const snapshotFetches = [];
page.on("response", (r) => {
  if (r.url().includes("/data/jiangshan/snapshots/")) {
    snapshotFetches.push(`${r.status()} ${r.url().split("/").pop()}`);
  }
});

// ── 进入漫游模式（默认即探索态）─────────────────────────────────
try {
  // waitForResponse 必须先注册再导航（否则 networkidle2 期间已完成，永久错过）
  const sanguoResp = page.waitForResponse((r) => r.url().includes("s_sanguo_a") && r.ok, { timeout: 30000 });
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".dynasty-timeline__bands", { timeout: 30000 });
  await sanguoResp;
  await page.waitForSelector(".polity-label", { timeout: 30000 });
} catch (err) {
  const state = await page.evaluate(() => ({
    url: location.href,
    hasStage: !!document.querySelector(".exploration-stage"),
    hasTimeline: !!document.querySelector(".dynasty-timeline"),
    hasBands: !!document.querySelector(".dynasty-timeline__bands"),
    loading: document.querySelector(".exploration-loading")?.textContent ?? null,
    empty: document.querySelector(".exploration-empty-stage__card")?.textContent?.slice(0, 120) ?? null,
    bodyText: document.body?.textContent?.slice(0, 200) ?? "",
  })).catch((e) => ({ evalErr: String(e) }));
  console.log("TIMEOUT 诊断:", JSON.stringify(state, null, 2));
  console.log("页面异常:", pageErrors.join(" | ") || "无");
  console.log("快照请求:", snapshotFetches.join(" → ") || "无");
  await page.screenshot({ path: "/tmp/verify-timeout.png" }).catch(() => {});
  await browser.close();
  process.exit(2);
}
await new Promise((r) => setTimeout(r, 800));

// ── 1. 初始 220：三国疆域 ──────────────────────────────────────
const state220 = await page.evaluate(() => {
  const bubble = document.querySelector(".dynasty-timeline__bubble")?.textContent ?? "";
  const active = document.querySelector(".dynasty-timeline__band.is-active");
  const labels = [...document.querySelectorAll(".polity-label__name")].map((n) => n.textContent);
  const bands = [...document.querySelectorAll(".dynasty-timeline__band")].map((b) => ({
    title: b.getAttribute("title"), bg: b.style.background, flex: b.style.flex,
  }));
  const tl = document.querySelector(".dynasty-timeline").getBoundingClientRect();
  const map = document.querySelector(".exploration-stage__map").getBoundingClientRect();
  const stage = document.querySelector(".exploration-stage").getBoundingClientRect();
  const handle = !!document.querySelector(".dynasty-timeline__handle");
  const ticks = [...document.querySelectorAll(".dynasty-timeline__ticks span")].map((t) => t.textContent);
  const phaseCard = document.querySelector(".exploration-phase-card")?.textContent ?? "";
  return { bubble, activeTitle: active?.getAttribute("title") ?? "", labels, bands, handle, ticks,
           layout: { tlX: tl.x, tlW: tl.width, tlTop: tl.top, stageX: stage.x, stageW: stage.width, mapBottom: map.bottom },
           phaseCard };
});
check("220 气泡显示「220 · 三国」", state220.bubble.includes("220") && state220.bubble.includes("三国"), state220.bubble);
check("220 三国带 is-active 且用 tint 色", state220.activeTitle.includes("三国"), state220.activeTitle);
check("220 政权标签含 魏/蜀汉/吴", ["魏", "蜀汉", "吴"].every((t) => state220.labels.includes(t)), state220.labels.slice(0, 8).join(","));
check("色带用各朝 tint（≥15 条且颜色各异）", state220.bands.length >= 15 && new Set(state220.bands.map((b) => b.bg)).size >= 15,
  `${state220.bands.length} 带, ${new Set(state220.bands.map((b) => b.bg)).size} 色`);
check("竖条手柄存在", state220.handle);
check("刻度行=各朝起点+末年", state220.ticks.length === state220.bands.length + 1, state220.ticks.slice(0, 4).join(" ") + " … " + state220.ticks.at(-1));
check("时间轴全宽底栏（与舞台同宽、在地图下方）",
  Math.abs(state220.layout.tlX - state220.layout.stageX) < 24 &&
  state220.layout.tlW > state220.layout.stageW * 0.9 &&
  state220.layout.tlTop >= state220.layout.mapBottom - 2,
  JSON.stringify(state220.layout));
check("220 阶段卡显示 三国", state220.phaseCard.includes("三国"), state220.phaseCard.slice(0, 60));
await page.screenshot({ path: "/tmp/verify-220.png" });

// ── 2. 拖时间轴到 -204：楚汉并立 ───────────────────────────────
// 在「秦」色带内按年份比例计算落点（带内分段线性，序号空间）
const dragTarget = await page.evaluate(() => {
  const bands = [...document.querySelectorAll(".dynasty-timeline__band")];
  const qin = bands.find((b) => b.getAttribute("title")?.startsWith("秦"));
  const track = document.querySelector(".dynasty-timeline__track");
  const tr = track.getBoundingClientRect();
  const qr = qin.getBoundingClientRect();
  // 目标年 -204：ord(-204)=-203；秦 ord(-221)=-220 → ord(-203)=-202，跨 18
  const local = (-203 - (-220)) / 18;
  return { x: qr.left + qr.width * local, y: tr.top + tr.height / 2 };
});
await page.mouse.click(dragTarget.x, dragTarget.y);
await page.waitForResponse((r) => r.url().includes("s_qin_chuhan") && r.ok, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));

const stateChuhan = await page.evaluate(() => {
  const bubble = document.querySelector(".dynasty-timeline__bubble")?.textContent ?? "";
  const labels = [...document.querySelectorAll(".polity-label__name")].map((n) => n.textContent);
  const phaseCard = document.querySelector(".exploration-phase-card")?.textContent ?? "";
  const active = document.querySelector(".dynasty-timeline__band.is-active");
  return { bubble, labels, phaseCard, activeTitle: active?.getAttribute("title") ?? "" };
});
check("-204 落点在楚汉相争阶段（气泡年份 ∈ 前206..前203）", /前20[3-6]/.test(stateChuhan.bubble), stateChuhan.bubble);
check("楚汉并立政权标签含 汉（刘邦）/西楚（项羽）",
  stateChuhan.labels.some((t) => t.includes("汉")) && stateChuhan.labels.some((t) => t.includes("西楚")),
  stateChuhan.labels.slice(0, 6).join(","));
check("阶段卡显示秦 · s_qin_chuhan 阶段", stateChuhan.phaseCard.includes("秦") && stateChuhan.phaseCard.includes("chuhan"), stateChuhan.phaseCard.slice(0, 80));
check("秦带转 is-active", stateChuhan.activeTitle.startsWith("秦"), stateChuhan.activeTitle);
await page.screenshot({ path: "/tmp/verify-chuhan.png" });

// ── 3. 再拖到 -206（阶段另一端）─────────────────────────────────
const drag206 = await page.evaluate(() => {
  const bands = [...document.querySelectorAll(".dynasty-timeline__band")];
  const qin = bands.find((b) => b.getAttribute("title")?.startsWith("秦"));
  const track = document.querySelector(".dynasty-timeline__track");
  const tr = track.getBoundingClientRect();
  const qr = qin.getBoundingClientRect();
  const local = (-205 - (-220)) / 18; // ord(-206)=-205
  return { x: qr.left + qr.width * local, y: tr.top + tr.height / 2 };
});
await page.mouse.click(drag206.x, drag206.y);
await new Promise((r) => setTimeout(r, 900));
const state206 = await page.evaluate(() => ({
  bubble: document.querySelector(".dynasty-timeline__bubble")?.textContent ?? "",
  labels: [...document.querySelectorAll(".polity-label__name")].map((n) => n.textContent),
}));
check("-206 仍是楚汉并立（同 phase 不换快照）", /前20[3-6]/.test(state206.bubble) &&
  state206.labels.some((t) => t.includes("西楚")), state206.bubble);
await page.screenshot({ path: "/tmp/verify-206.png" });

// ── 汇总 ────────────────────────────────────────────────────────
check("页面无 JS 异常", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
console.log("快照请求序列:", snapshotFetches.join(" → "));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
await browser.close();
process.exit(failed.length ? 1 : 0);
