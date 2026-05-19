"use client";

import { useEffect, useState } from "react";

import { HistoryMapStage } from "./history-map-stage";

const chronicleMarks = ["I", "II", "III", "IV"];

function formatYear(year) {
  if (year < 0) return `前${Math.abs(year)}`;
  return String(year);
}

function certaintyLabel(level) {
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

function buildMilestones(entries, rail, currentYear) {
  const entryByStoryId = new Map(entries.map((entry) => [entry.story.story_id, entry]));

  return rail.map((milestone) => {
    const storyEntry = milestone.story_id ? entryByStoryId.get(milestone.story_id) : null;
    return {
      year: milestone.year,
      label: milestone.label,
      note: milestone.note,
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

export function HistoryAtlasApp({ entries, timeline }) {
  const chronicleEntries = [...entries].sort((a, b) => a.story.timeline.year - b.story.timeline.year);
  const [selectedYear, setSelectedYear] = useState(chronicleEntries[0]?.story.timeline.year ?? 0);
  const [selectedQuestion, setSelectedQuestion] = useState(0);

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
  const currentIndex = chronicleEntries.findIndex((entry) => entry.story.story_id === story.story_id);
  const chronicleMark = chronicleMarks[currentIndex] ?? String(currentIndex + 1);
  const milestones = buildMilestones(chronicleEntries, timeline?.milestones ?? [], story.timeline.year);

  return (
    <main className="atlas-shell">
      <div className="atlas-shell__grain" />

      <header className="atlas-masthead">
        <div className="atlas-masthead__title">
          <p className="atlas-kicker">Little Star History Atlas · Chronicle {chronicleMark}</p>
          <div className="atlas-heading-row">
            <span className="atlas-year-mark">{formatYear(story.timeline.year)}</span>
            <h1>{event.title}</h1>
          </div>
          <p className="atlas-deck">{scene.deck}</p>
        </div>

        <div className="atlas-meta">
          <div>
            <span>时代 / Period</span>
            <strong>{event.period}</strong>
          </div>
          <div>
            <span>地图可信度 / Certainty</span>
            <strong>{certaintyLabel(story.map_plan.certainty)}</strong>
          </div>
          <div>
            <span>这一页在讲 / Focus</span>
            <strong>{scene.meta_label}</strong>
          </div>
        </div>
      </header>

      <section className="atlas-hero">
        <article className="atlas-map-card">
          <div className="atlas-map-card__header">
            <div>
              <p className="atlas-panel-kicker">历史态势图 / Historical Situation Map</p>
              <h2>{scene.map_headline}</h2>
              <p className="atlas-map-card__subhead">{scene.map_headline_en}</p>
            </div>
            <div className="atlas-map-card__badge">
              <span>示意图</span>
              <strong>{story.timeline.label}</strong>
            </div>
          </div>

          <div className="atlas-map-stage">
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
          </div>
        </article>

        <aside className="atlas-side-panel">
          <div className="dossier-card dossier-card--lead">
            <p className="atlas-panel-kicker">今年发生了什么 / This Year</p>
            <h3>{story.timeline.lesson}</h3>
            <p className="dossier-card__child-summary">{event.child_summary}</p>
            <div className="dossier-card__spotlight">
              <span>先看地图</span>
              <strong>{panel.child_spotlight}</strong>
            </div>
            <div className="dossier-inline-meta">
              {panel.year_tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="dossier-inline-meta">
              {panel.memory_anchors.map((anchor) => (
                <span key={anchor}>{anchor}</span>
              ))}
            </div>
          </div>

          <div className="dossier-card dossier-card--focus">
            <p className="atlas-panel-kicker">先看地图哪里 / Read The Map First</p>
            <ol className="focus-list">
              {panel.map_focus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>

            <details className="parent-details">
              <summary>给家长展开</summary>
              <div className="parent-details__body">
                <p className="atlas-panel-kicker">为什么重要 / Why It Matters</p>
                <p className="dossier-card__focus-lede">{story.event.importance}</p>

                <div className="dossier-subsection">
                  <p className="atlas-panel-kicker">阅读抓手 / Reading Keys</p>
                  <ul className="signal-list">
                    {panel.reading_keys.map((signal) => (
                      <li key={signal.label}>
                        <strong>{signal.label}</strong>
                        <span>{signal.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </div>
        </aside>
      </section>

      <section className="atlas-lower">
        <div className="timeline-card">
          <div className="timeline-card__header">
            <div>
              <p className="atlas-panel-kicker">时间轨 / Historical Rail</p>
              <h3>小星星历史时间轨</h3>
            </div>
            <span className="timeline-card__state">按顺序读下去</span>
          </div>
          <div className="timeline-rail">
            {milestones.map((milestone, index) => (
              <button
                key={milestone.year}
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
        </div>

        <div className="prompt-card">
          <div className="prompt-card__header">
            <div>
              <p className="atlas-panel-kicker">一起问问题 / Family Prompt Deck</p>
              <h3>看地图，再问问题</h3>
            </div>
            <span>
              {selectedQuestion + 1} / {promptDeck.length}
            </span>
          </div>

          <div className="prompt-card__question">
            <span className="prompt-card__badge">问题</span>
            <p>{currentPrompt}</p>
          </div>

          <div className="prompt-card__tabs">
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

          <div className="prompt-card__result">
            <p className="atlas-panel-kicker">历史结果 / Historical Result</p>
            <p>{event.result}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
