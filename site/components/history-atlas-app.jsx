"use client";

import { useEffect, useState } from "react";

import { HistoryMapStage } from "./history-map-stage";
import { TimeScrubber } from "./time-scrubber";
import { StoryMindMap } from "./story-mind-map";
import { ExplorationStage } from "./exploration-stage";
import {
  regionIdForStory,
} from "../lib/history-regions";
import {
  buildMilestones,
  selectEntryByStoryId,
  selectMilestoneByStoryId,
  milestoneInteractive,
  storyIdFromMilestone,
  dockAction,
  resolveCursor,
} from "../lib/story-selection";

function formatYear(year) {
  if (year < 0) return `前${Math.abs(year)}`;
  return String(year);
}

export function HistoryAtlasApp({ entries, timeline }) {
  const chronicleEntries = [...entries].sort((a, b) => a.story.timeline.year - b.story.timeline.year);
  // 身份选择用稳定 story_id（年份是日期不是身份，同年多故事按年 find 会串线）
  const [selectedStoryId, setSelectedStoryId] = useState(chronicleEntries[0]?.story.story_id ?? null);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [drawerTab, setDrawerTab] = useState("mindmap");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(false);
  const [focusRegion, setFocusRegion] = useState(null);
  // 键盘游标：可指向 planned 节点（无 story_id），使方向键不卡死。
  // 选中故事变化时重置为 null（游标跟随 docked interactive 节点）。
  const [cursorMilestoneId, setCursorMilestoneId] = useState(null);

  // ── Phase 3：探索 / 故事 双状态（一个地图舞台，两种状态）──────────
  // mode = "explore"（默认，时空漫游）| "story"（既有学习体验）。
  // 点击探索抽屉里的故事 → 进入故事状态；「返回地图探索」恢复探索现场
  // （年份 / 视角 / 右侧标签与开合状态，§2 故事学习状态）。
  const [mode, setMode] = useState("explore");
  // 探索现场快照（由 ExplorationStage 通过 onStateChange 持续记录）
  const [exploreState, setExploreState] = useState(null);
  // 进入故事前保存的探索现场（往返恢复用）
  const [savedExploreState, setSavedExploreState] = useState(null);

  const currentEntry = selectEntryByStoryId(chronicleEntries, selectedStoryId);

  useEffect(() => {
    setSelectedQuestion(0);
    setCursorMilestoneId(null);
  }, [selectedStoryId]);

  useEffect(() => {
    if (!chronicleEntries.some((entry) => entry.story.story_id === selectedStoryId)) {
      setSelectedStoryId(chronicleEntries[0]?.story.story_id ?? null);
    }
  }, [chronicleEntries, selectedStoryId]);

  // ── 探索 ↔ 故事 往返：进入故事前保存探索现场（含视角），返回时恢复 ──
  const enterStoryFromExplore = (storyId, exploreSnapshot) => {
    if (typeof storyId === "string" && storyId) {
      setSelectedStoryId(storyId);
    }
    setSavedExploreState(exploreSnapshot ?? exploreState);
    setMode("story");
  };

  const returnToExplore = () => {
    setMode("explore");
    // savedExploreState 由 ExplorationStage 通过 restoredState 读取恢复
  };

  // 探索状态：数据缺失时也保留故事入口（§5）
  if (mode === "explore") {
    return (
      <main className="atlas-shell atlas-shell--explore">
        <div className="atlas-shell__grain" />
        <header className="atlas-topbar atlas-topbar--explore">
          <p className="atlas-kicker">小星星的历史漫游</p>
          <div className="atlas-topbar__title">
            <h1>时空探索 · 自由漫游</h1>
          </div>
          <div className="atlas-topbar__badges">
            <button
              type="button"
              className="atlas-mode-switch"
              onClick={() => setMode("story")}
              title="回到故事学习体验"
            >
              故事目录 ▸
            </button>
          </div>
        </header>

        <ExplorationStage
          entries={chronicleEntries}
          onEnterStory={enterStoryFromExplore}
          restoredState={savedExploreState ?? undefined}
          onStateChange={setExploreState}
        />
      </main>
    );
  }

  if (!currentEntry) {
    return null;
  }

  const { event, story } = currentEntry;
  const selectedYear = story.timeline.year;
  const scene = story.scene ?? {
    deck: event.child_summary,
    map_headline: story.timeline.label,
    map_headline_en: "Story Map",
    meta_label: story.panel?.year_tags?.[0] ?? event.period,
    annotations: [],
    legend: [],
    caption: story.panel?.child_spotlight,
  };
  const panel = story.panel;
  const promptDeck = panel.parent_prompt?.length ? panel.parent_prompt : event.questions;
  const currentPrompt = promptDeck[selectedQuestion] ?? promptDeck[0];
  const milestones = buildMilestones(chronicleEntries, timeline?.milestones ?? [], selectedStoryId);

  // docked 里程碑按 story_id 选取：同年多故事各自命中自己的节点，保证唯一
  const dockedMilestone = selectMilestoneByStoryId(milestones, selectedStoryId);
  // cursor 里程碑：键盘游标可指向 planned 节点（无 story_id），使方向键不卡死。
  // 无游标时回退到 docked（interactive）。
  const cursorMilestone = resolveCursor(milestones, cursorMilestoneId, dockedMilestone);
  const skeletonMode = !milestoneInteractive(dockedMilestone);

  const dockToMilestone = (milestone) => {
    const action = dockAction(milestone);
    if (action.type === "select-story") {
      setSelectedStoryId(action.storyId);
      setCursorMilestoneId(null);
      setDrawerOpen(true);
      // 切换故事时重置大区聚焦（plan.md）
      setFocusRegion(null);
    } else if (action.type === "advance-cursor") {
      // planned 节点：前进游标（不卡死），有大区则触发预览（与目录按钮一致）
      setCursorMilestoneId(action.milestoneId);
      if (action.regionId) {
        setFocusRegion({ id: action.regionId, nonce: Date.now() });
      }
    }
  };

  const recordedCount = milestones.filter((m) => m.interactive).length;
  // 真实口述计数：narration_status 区分「可打开」（interactive）与「真实口述」。
  // placeholder = 占位待回填；unknown = 无证据（不自动标 recorded）。
  const realNarrationCount = milestones.filter(
    (m) => m.interactive && m.narration_status === "recorded",
  ).length;
  const placeholderNarrationCount = milestones.filter(
    (m) => m.interactive && m.narration_status === "placeholder",
  ).length;

  const drawerTabs = [
    { key: "mindmap", label: "故事导图" },
    { key: "classic", label: "经典语句" },
    { key: "talk", label: "讨论话题" },
  ];

  return (
    <main className="atlas-shell atlas-shell--cinema">
      <div className="atlas-shell__grain" />

      <header className="atlas-topbar">
        <p className="atlas-kicker">小星星的历史漫游</p>
        <div className="atlas-topbar__title">
          <span className="atlas-year-mark">{formatYear(story.timeline.year)}</span>
          <h1>{skeletonMode && dockedMilestone ? dockedMilestone.label : event.title}</h1>
        </div>
        <div className="atlas-topbar__badges">
          <span className="atlas-badge">
            时代 · {skeletonMode && dockedMilestone ? dockedMilestone.period : event.period}
          </span>
          <button
            type="button"
            className="atlas-mode-switch"
            onClick={returnToExplore}
            title="返回地图探索（恢复年份、视角与面板）"
          >
            ◂ 返回地图探索
          </button>
        </div>
        <button
          className="atlas-topbar__drawer-toggle"
          type="button"
          onClick={() => setDrawerOpen((open) => !open)}
          title={drawerOpen ? "收起故事面板" : "展开故事面板"}
        >
          {drawerOpen ? "▸" : "◂"}
        </button>
      </header>

      <div className="atlas-cinema">
        <div className="atlas-cinema__map">
          <HistoryMapStage
            key={story.story_id}
            story={story}
            onSelectPlace={() => setDrawerOpen(true)}
            focusRegion={focusRegion}
            onRegionClick={() => {}}
          />
          <div className="atlas-frame atlas-frame--top" />
          <div className="atlas-frame atlas-frame--right" />
          <div className="atlas-frame atlas-frame--bottom" />
          <div className="atlas-frame atlas-frame--left" />

          <div className="atlas-latband atlas-latband--north">北方 / North</div>
          <div className="atlas-latband atlas-latband--south">南方 / South</div>
          <div className="atlas-compass">
            <span>N</span>
          </div>

          <div className="atlas-grid atlas-grid--vertical" />
          <div className="atlas-grid atlas-grid--horizontal" />

          {scene.annotations.map((annotation) => (
            <div
              key={annotation.label}
              className={annotation.kind === "region" ? "atlas-region" : "atlas-disturbance-text"}
              style={{
                left: annotation.left,
                right: annotation.right,
                top: annotation.top,
                bottom: annotation.bottom,
              }}
            >
              {annotation.label}
            </div>
          ))}

          <div className="atlas-stage-legend">
            {scene.legend.map((item) => (
              <span key={item.label}>
                <i className={`atlas-stage-legend__swatch atlas-stage-legend__swatch--${item.key}`} />
                {item.label}
              </span>
            ))}
          </div>

          <div className="atlas-map-caption">
            <p>{scene.caption}</p>
          </div>

          <div className="atlas-map-headline">
            <p className="atlas-panel-kicker">历史态势图 / Historical Situation Map</p>
            <h2>{skeletonMode && dockedMilestone ? dockedMilestone.label : scene.map_headline}</h2>
            <p className="atlas-map-headline__sub">
              {skeletonMode && dockedMilestone
                ? `${formatYear(dockedMilestone.year)} · ${dockedMilestone.period} · 骨架节点，故事录制中`
                : scene.deck}
            </p>
          </div>

          {!drawerOpen && (
            <div
              className="atlas-map-storyhint"
              role="button"
              tabIndex={0}
              onClick={() => setDrawerOpen(true)}
              onKeyDown={(e) => { if (e.key === "Enter") setDrawerOpen(true); }}
            >
              <span className="atlas-map-storyhint__badge">{story.child_story?.title ?? event.title}</span>
              <span className="atlas-map-storyhint__cta">点击唤醒故事 ▸</span>
            </div>
          )}
        </div>

        <aside className={`atlas-drawer${drawerOpen ? " is-open" : ""}`}>
          <div className="atlas-drawer__tabs">
            {drawerTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`atlas-drawer__tab${drawerTab === tab.key ? " is-active" : ""}`}
                onClick={() => setDrawerTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="atlas-drawer__body">
            {drawerTab === "mindmap" ? (
              <div className="atlas-drawer__section">
                <p className="atlas-panel-kicker">故事梗概 / Story Mind Map</p>
                <h3 className="atlas-drawer__title">{event.title}</h3>
                <StoryMindMap story={story} />
                <div className="drawer-spotlight">
                  <span>先看地图</span>
                  <strong>{panel.child_spotlight}</strong>
                </div>
              </div>
            ) : null}

            {drawerTab === "classic" ? (
              <div className="atlas-drawer__section">
                <p className="atlas-panel-kicker">经典语句 / Words To Remember</p>
                <h3 className="atlas-drawer__title">记住这些话</h3>
                <ul className="classic-list">
                  {panel.memory_anchors.map((anchor) => (
                    <li key={anchor} className="classic-list__item">
                      <span className="classic-list__mark">❖</span>
                      <span>{anchor}</span>
                    </li>
                  ))}
                </ul>
                <div className="classic-sub">
                  <p className="atlas-panel-kicker">阅读抓手</p>
                  <ul className="classic-keys">
                    {panel.reading_keys.map((signal) => (
                      <li key={signal.label}>
                        <strong>{signal.label}</strong>
                        <span>{signal.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {drawerTab === "talk" ? (
              <div className="atlas-drawer__section">
                <p className="atlas-panel-kicker">一起讨论 / Family Talk</p>
                <h3 className="atlas-drawer__title">看地图，再问问题</h3>
                <div className="talk-question">
                  <span className="talk-question__badge">问题 {selectedQuestion + 1}</span>
                  <p>{currentPrompt}</p>
                </div>
                <div className="talk-tabs">
                  {promptDeck.map((question, index) => (
                    <button
                      key={question}
                      className={index === selectedQuestion ? "is-active" : ""}
                      onClick={() => setSelectedQuestion(index)}
                      type="button"
                    >
                      0{index + 1}
                    </button>
                  ))}
                </div>
                <details className="parent-details">
                  <summary>给家长展开 · 历史结果与意义</summary>
                  <div className="parent-details__body">
                    <p className="atlas-panel-kicker">历史结果</p>
                    <p>{event.result}</p>
                    <p className="atlas-panel-kicker">为什么重要</p>
                    <p>{story.event.importance}</p>
                  </div>
                </details>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <TimeScrubber
        milestones={milestones}
        docked={dockedMilestone}
        cursor={cursorMilestone}
        onDock={dockToMilestone}
        onYearChange={(milestone) => {
          if (milestoneInteractive(milestone)) {
            setSelectedStoryId(storyIdFromMilestone(milestone));
          }
        }}
      />

      <section className="atlas-story-index">
        <button
          className="atlas-story-index__toggle"
          type="button"
          onClick={() => setRailOpen((open) => !open)}
        >
          <span className="atlas-panel-kicker">故事目录 / Story Index</span>
          <span className="atlas-story-index__meta">
            {milestones.length} 个节点 · {recordedCount} 个可打开 · 真实口述 {realNarrationCount} · 口述占位 {placeholderNarrationCount}
          </span>
          <span className={`atlas-story-index__chevron${railOpen ? " is-open" : ""}`}>▾</span>
        </button>

        {railOpen ? (
          <div className="timeline-rail">
            {milestones.map((milestone, index) => {
              const previewable = !milestone.interactive && Boolean(milestone.regionId);
              return (
                <button
                  key={milestone.render_key ?? milestone.milestone_id}
                  className={`timeline-stop timeline-stop--${milestone.status}`}
                  disabled={!milestone.interactive && !previewable}
                  onClick={() => {
                    if (milestone.interactive) {
                      setSelectedStoryId(storyIdFromMilestone(milestone));
                    } else if (previewable) {
                      // planned 里程碑：仅 flyTo + 高亮大区，不改选中故事（plan.md）
                      setFocusRegion({ id: milestone.regionId, nonce: Date.now() });
                    }
                  }}
                  type="button"
                >
                  <span className="timeline-stop__year">{formatYear(milestone.year)}</span>
                  <span className="timeline-stop__label">{milestone.label}</span>
                  <span className="timeline-stop__note">
                    {milestone.note}
                    {previewable ? " · 可先看大区" : ""}
                  </span>
                  {index < milestones.length - 1 ? <i className="timeline-stop__bar" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
