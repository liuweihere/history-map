"use client";

import { useEffect, useState } from "react";

import { HistoryMapStage } from "./history-map-stage";
import { TimeScrubber } from "./time-scrubber";
import { StoryMindMap } from "./story-mind-map";

function formatYear(year) {
  if (year < 0) return `前${Math.abs(year)}`;
  return String(year);
}

function buildMilestones(entries, rail, currentYear) {
  const entryByStoryId = new Map(entries.map((entry) => [entry.story.story_id, entry]));

  return rail.map((milestone) => {
    const storyEntry = milestone.story_id ? entryByStoryId.get(milestone.story_id) : null;
    return {
      ...milestone,
      status:
        milestone.year === currentYear
          ? "active"
          : storyEntry
            ? "available"
            : "upcoming",
      interactive: Boolean(storyEntry),
      storyYear: storyEntry?.story.timeline.year ?? null,
    };
  });
}

function milestoneInteractive(milestone) {
  return Boolean(milestone && milestone.story_id && milestone.interactive);
}

export function HistoryAtlasApp({ entries, timeline }) {
  const chronicleEntries = [...entries].sort((a, b) => a.story.timeline.year - b.story.timeline.year);
  const [selectedYear, setSelectedYear] = useState(chronicleEntries[0]?.story.timeline.year ?? 0);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [drawerTab, setDrawerTab] = useState("mindmap");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(false);

  const currentEntry =
    chronicleEntries.find((entry) => entry.story.timeline.year === selectedYear) ?? chronicleEntries[0];

  useEffect(() => {
    setSelectedQuestion(0);
  }, [selectedYear]);

  useEffect(() => {
    if (!chronicleEntries.some((entry) => entry.story.timeline.year === selectedYear)) {
      setSelectedYear(chronicleEntries[0]?.story.timeline.year ?? 0);
    }
  }, [chronicleEntries, selectedYear]);

  if (!currentEntry) {
    return null;
  }

  const { event, story } = currentEntry;
  const scene = story.scene ?? {
    deck: event.child_summary,
    map_headline: story.timeline.label,
    map_headline_en: "Story Map",
    meta_label: story.panel.year_tags?.[0] ?? event.period,
    annotations: [],
    legend: [],
    caption: story.panel.child_spotlight,
  };
  const panel = story.panel;
  const promptDeck = panel.parent_prompt?.length ? panel.parent_prompt : event.questions;
  const currentPrompt = promptDeck[selectedQuestion] ?? promptDeck[0];
  const milestones = buildMilestones(chronicleEntries, timeline?.milestones ?? [], story.timeline.year);

  const dockedMilestone = milestones.find((m) => m.year === selectedYear) ?? null;
  const skeletonMode = !milestoneInteractive(dockedMilestone);

  const dockToMilestone = (milestone) => {
    if (milestoneInteractive(milestone)) {
      setSelectedYear(milestone.storyYear);
      setDrawerOpen(true);
    }
  };

  const recordedCount = milestones.filter((m) => m.interactive).length;

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
          <HistoryMapStage key={story.story_id} story={story} />
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
        onDock={dockToMilestone}
        onYearChange={(milestone) => {
          if (milestoneInteractive(milestone)) {
            setSelectedYear(milestone.storyYear);
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
            {milestones.length} 个节点 · {recordedCount} 个已录制
          </span>
          <span className={`atlas-story-index__chevron${railOpen ? " is-open" : ""}`}>▾</span>
        </button>

        {railOpen ? (
          <div className="timeline-rail">
            {milestones.map((milestone, index) => (
              <button
                key={`${milestone.year}-${milestone.label}`}
                className={`timeline-stop timeline-stop--${milestone.status}`}
                disabled={!milestone.interactive}
                onClick={() => milestone.interactive && milestone.storyYear !== null && setSelectedYear(milestone.storyYear)}
                type="button"
              >
                <span className="timeline-stop__year">{formatYear(milestone.year)}</span>
                <span className="timeline-stop__label">{milestone.label}</span>
                <span className="timeline-stop__note">{milestone.note}</span>
                {index < milestones.length - 1 ? <i className="timeline-stop__bar" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
