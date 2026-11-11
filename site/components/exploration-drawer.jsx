"use client";

import React from "react";

import {
  formatYear,
} from "../lib/jiangshan-time";
import {
  milestonesAtYear,
  milestoneSourceKey,
  milestoneSiteCoordinate,
  bridgeStoryIds,
} from "../lib/jiangshan-data.js";

/**
 * 探索状态右侧抽屉（PLAN.md V3 §2）。
 *
 * - 默认收起，入口清晰可见；展开后默认「我们的故事」，另一标签「重大事件」；
 * - 仅列当前导航朝代的内容；
 * - 「我们的故事」：按年份及稳定 story_id 排序；同年多故事独立显示；
 *   空列表显示「这个朝代的故事还在准备中」。
 * - 「重大事件」：仅列当前朝代社区事件，突出所选年份；点击一条选择对应年份，
 *   有可信坐标时聚焦；有审定关联时才提供「查看相关故事」；没有坐标或关联
 *   仍显示事件文字，不捏造地点或关系。
 *
 * @param {boolean} open
 * @param {function} onToggle  () => void
 * @param {string} tab  "stories" | "events"
 * @param {function} onTabChange  (tab) => void
 * @param {object|null} dynasty  当前朝代
 * @param {array} dynastyStories  当前朝代的本站故事条目 [{event,story}]
 * @param {array} dynastyMilestones  当前朝代的 milestone features
 * @param {number} selectedYear
 * @param {object|null} bridge  审定桥接表
 * @param {function} onSelectStory  (storyId) => void
 * @param {function} onSelectYear  (year) => void  点击事件 → 选择对应年份
 * @param {function|null} onFocusSite  (coord) => void  聚焦可信坐标
 */
export function ExplorationDrawer({
  open,
  onToggle,
  tab,
  onTabChange,
  dynasty,
  dynastyStories,
  dynastyMilestones,
  selectedYear,
  bridge,
  onSelectStory,
  onSelectYear,
  onFocusSite,
}) {
  const tabs = [
    { key: "stories", label: "我们的故事" },
    { key: "events", label: "重大事件" },
  ];

  return (
    <aside className={`exploration-drawer${open ? " is-open" : ""}`}>
      <div className="exploration-drawer__head">
        <button
          type="button"
          className="exploration-drawer__toggle"
          onClick={onToggle}
          title={open ? "收起面板" : "展开面板"}
          aria-expanded={open}
        >
          {open ? "▸" : "◂"}
        </button>
        {open ? (
          <div className="exploration-drawer__tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`exploration-drawer__tab${tab === t.key ? " is-active" : ""}`}
                onClick={() => onTabChange(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="exploration-drawer__collapsed-label">
            {dynasty ? dynasty.title : "故事与事件"}
          </span>
        )}
      </div>

      {open ? (
        <div className="exploration-drawer__body">
          {tab === "stories" ? (
            <StoriesTab
              dynasty={dynasty}
              stories={dynastyStories}
              onSelectStory={onSelectStory}
            />
          ) : null}

          {tab === "events" ? (
            <EventsTab
              dynasty={dynasty}
              milestones={dynastyMilestones}
              selectedYear={selectedYear}
              bridge={bridge}
              onSelectYear={onSelectYear}
              onFocusSite={onFocusSite}
              onSelectStory={onSelectStory}
            />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function StoriesTab({ dynasty, stories, onSelectStory }) {
  if (!dynasty) {
    return (
      <EmptyNote>
        这个时期还没有对应的导航朝代，故事可从「故事目录」打开。
      </EmptyNote>
    );
  }
  if (!stories || stories.length === 0) {
    return <EmptyNote>这个朝代的故事还在准备中。</EmptyNote>;
  }

  const sorted = [...stories].sort((a, b) => {
    const ya = a.story.timeline.year;
    const yb = b.story.timeline.year;
    if (ya !== yb) return ya - yb;
    return (a.story.story_id ?? "").localeCompare(b.story.story_id ?? "");
  });

  return (
    <ul className="exploration-story-list">
      {sorted.map(({ story, event }) => (
        <li key={story.story_id} className="exploration-story-list__item">
          <button
            type="button"
            className="exploration-story-list__btn"
            onClick={() => onSelectStory(story.story_id)}
          >
            <span className="exploration-story-list__year">{formatYear(story.timeline.year)}</span>
            <span className="exploration-story-list__title">{event.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EventsTab({
  dynasty,
  milestones,
  selectedYear,
  bridge,
  onSelectYear,
  onFocusSite,
  onSelectStory,
}) {
  if (!dynasty) {
    return <EmptyNote>这个时期还没有对应的导航朝代事件。</EmptyNote>;
  }
  if (!milestones || milestones.length === 0) {
    return <EmptyNote>这个朝代的事件还在准备中。</EmptyNote>;
  }

  const sorted = [...milestones].sort((a, b) => {
    const ya = a.properties?.year ?? 0;
    const yb = b.properties?.year ?? 0;
    return ya - yb;
  });

  return (
    <ul className="exploration-event-list">
      {sorted.map((feature, idx) => {
        const p = feature.properties ?? {};
        const isCurrent = p.year === selectedYear;
        const coord = milestoneSiteCoordinate(feature);
        const sk = milestoneSourceKey(feature);
        const linked = bridgeStoryIds(bridge, sk);
        return (
          <li
            key={`${sk ?? idx}-${p.year}-${idx}`}
            className={`exploration-event-list__item${isCurrent ? " is-current" : ""}`}
          >
            <button
              type="button"
              className="exploration-event-list__btn"
              onClick={() => {
                if (typeof p.year === "number") onSelectYear(p.year);
                if (coord) onFocusSite?.(coord);
              }}
            >
              <span className="exploration-event-list__year">{formatYear(p.year)}</span>
              <span className="exploration-event-list__headline">{p.headline ?? "（无标题）"}</span>
              {coord ? (
                <span className="exploration-event-list__hint">有可信坐标 · 点击聚焦</span>
              ) : (
                <span className="exploration-event-list__hint">无坐标 · 仅显示文字</span>
              )}
            </button>
            {linked.length > 0 ? (
              <div className="exploration-event-list__links">
                {linked.map((sid) => (
                  <button
                    key={sid}
                    type="button"
                    className="exploration-event-list__link"
                    onClick={() => onSelectStory(sid)}
                  >
                    查看相关故事 ▸
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function EmptyNote({ children }) {
  return <p className="exploration-empty">{children}</p>;
}
