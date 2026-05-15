"use client";

import { useEffect, useState } from "react";

import { HistoryMapStage } from "./history-map-stage";

const chronicleMarks = ["I", "II", "III", "IV"];

const milestoneDefaults = [
  { year: 184, label: "黄巾起义", note: "乱世起点" },
  { year: 190, label: "董卓进京", note: "中央崩塌" },
  { year: 200, label: "官渡之战", note: "北方重排" },
  { year: 208, label: "赤壁之战", note: "南北分岔" },
  { year: 214, label: "刘备入蜀", note: "蜀地成形" },
  { year: 220, label: "曹丕代汉", note: "东汉终结" },
  { year: 221, label: "刘备称帝", note: "蜀汉建立" },
  { year: 229, label: "孙权称帝", note: "三国定局" },
];

const sceneByStoryId = {
  story_001_yellow_turban: {
    deck:
      "东汉的疆域没有立刻破碎，但政治秩序先出现了裂缝。黄巾起义是这张历史地图开始失稳的第一道大波纹。",
    mapHeadline: "天下还连在一起，但秩序开始裂开",
    mapHeadlineEn: "Empire still intact, authority under strain",
    metaLabel: "乱世起点",
    yearTags: ["节点一", "地方先乱了"],
    childSpotlight: "先看钜鹿，再看洛阳。",
    childSummary:
      "很多地方先乱了起来，东汉虽然还在，可是已经受了伤。",
    readingKeys: [
      { label: "东汉版图仍统一", value: "疆域仍在，秩序先裂" },
      { label: "起义并非局部小事", value: "影响多州郡，中央应对吃力" },
      { label: "三国尚未出现", value: "但群雄时代的土壤已经形成" },
    ],
    mapFocus: [
      "先看钜鹿一带的动乱区域，它提醒我们历史变化先从地方冒出来。",
      "再看洛阳代表的中央秩序区，孩子要知道东汉还在，但已经受伤。",
      "最后把两者连起来理解：失败的起义也会改变天下后面的走向。",
    ],
    annotations: [
      { kind: "region", label: "中原 / Central Plain", left: "43%", top: "52%" },
      { kind: "region", label: "冀州地带 / Hebei Zone", left: "63%", top: "20%" },
      { kind: "region", label: "东汉中央秩序", left: "29%", top: "64%" },
      { kind: "disturbance", label: "黄巾起义扩散带", right: "24%", top: "19%" },
      { kind: "disturbance", label: "中央受损", right: "38px", top: "154px" },
    ],
    legend: [
      { key: "backdrop", label: "中华地理轮廓" },
      { key: "han", label: "东汉大势范围" },
      { key: "uprising", label: "黄巾动乱高亮" },
      { key: "river", label: "黄河与主交通轴" },
    ],
    caption:
      "先看整张中华地理轮廓，再看东汉大势范围和黄巾动乱高亮区。地图不是精确军政边界，而是帮助孩子理解“帝国仍在、秩序已裂”的历史状态图。",
  },
  story_002_dong_zhuo_entry: {
    deck:
      "到 190 年，天下不只是在边缘和地方摇晃，连皇帝身边的中央也被强人控制。历史从“失稳”走向了“中央崩塌”。",
    mapHeadline: "朝廷还在，可权力已经被夺走",
    mapHeadlineEn: "The court survives in name, but power is seized",
    metaLabel: "中央崩塌",
    yearTags: ["节点二", "中央也乱了"],
    childSpotlight: "先看洛阳，再看从长安过来的力量。",
    childSummary:
      "这次不只是地方乱，连皇帝身边的中央也被强人控制了。",
    readingKeys: [
      { label: "危机转入中央", value: "洛阳不只是都城，也是权力争夺中心" },
      { label: "皇帝仍在但失去主导", value: "这会让地方更不相信中央能自己恢复秩序" },
      { label: "后续群雄起兵有了政治理由", value: "讨董与自保开始合流" },
    ],
    mapFocus: [
      "先看洛阳，它现在不只是都城，而是被强人控制的中央危机中心。",
      "再看长安到洛阳的进京走廊，理解权力是怎样从地方军队进入中央的。",
      "最后看名义中央区：皇帝和朝廷还在，但真正的主导权已经变了。",
    ],
    annotations: [
      { kind: "region", label: "洛阳 / Court Crisis", left: "50%", top: "52%" },
      { kind: "region", label: "长安 / Western Pivot", left: "24%", top: "36%" },
      { kind: "region", label: "东汉名义中央", left: "58%", top: "68%" },
      { kind: "disturbance", label: "董卓入京路线", left: "28%", top: "26%" },
      { kind: "disturbance", label: "中央被控制", right: "42px", top: "168px" },
    ],
    legend: [
      { key: "backdrop", label: "中华地理轮廓" },
      { key: "han", label: "东汉名义版图" },
      { key: "uprising", label: "中央危机高亮" },
      { key: "river", label: "西向入京路线" },
    ],
    caption:
      "先看整张中华地理轮廓，再看东汉名义版图和中央危机高亮区。地图强调的是权力如何进入中央、夺走中央，而不是细化每一支军队的具体部署。",
  },
};

function certaintyLabel(level) {
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

function buildMilestones(entries, currentYear) {
  const entryByYear = new Map(entries.map((entry) => [entry.story.timeline.year, entry]));

  return milestoneDefaults.map((milestone) => {
    const entry = entryByYear.get(milestone.year);
    if (!entry) {
      return { ...milestone, status: "upcoming", interactive: false };
    }

    return {
      year: milestone.year,
      label: entry.story.timeline.label,
      note: milestone.note,
      status: milestone.year === currentYear ? "active" : "available",
      interactive: true,
    };
  });
}

export function HistoryAtlasApp({ entries }) {
  const chronicleEntries = [...entries].sort((a, b) => a.story.timeline.year - b.story.timeline.year);
  const [selectedYear, setSelectedYear] = useState(chronicleEntries[0]?.story.timeline.year ?? 184);
  const [selectedQuestion, setSelectedQuestion] = useState(0);

  const currentEntry =
    chronicleEntries.find((entry) => entry.story.timeline.year === selectedYear) ?? chronicleEntries[0];

  useEffect(() => {
    setSelectedQuestion(0);
  }, [selectedYear]);

  useEffect(() => {
    if (!chronicleEntries.some((entry) => entry.story.timeline.year === selectedYear)) {
      setSelectedYear(chronicleEntries[0]?.story.timeline.year ?? 184);
    }
  }, [chronicleEntries, selectedYear]);

  if (!currentEntry) {
    return null;
  }

  const { event, story } = currentEntry;
  const scene = sceneByStoryId[story.story_id] ?? sceneByStoryId.story_001_yellow_turban;
  const currentPrompt = event.questions[selectedQuestion] ?? event.questions[0];
  const currentIndex = chronicleEntries.findIndex((entry) => entry.story.story_id === story.story_id);
  const chronicleMark = chronicleMarks[currentIndex] ?? String(currentIndex + 1);
  const milestones = buildMilestones(chronicleEntries, story.timeline.year);

  return (
    <main className="atlas-shell">
      <div className="atlas-shell__grain" />

      <header className="atlas-masthead">
        <div className="atlas-masthead__title">
          <p className="atlas-kicker">Little Star History Atlas · Chronicle {chronicleMark}</p>
          <div className="atlas-heading-row">
            <span className="atlas-year-mark">{story.timeline.year}</span>
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
            <strong>{scene.metaLabel}</strong>
          </div>
        </div>
      </header>

      <section className="atlas-hero">
        <article className="atlas-map-card">
          <div className="atlas-map-card__header">
            <div>
              <p className="atlas-panel-kicker">历史态势图 / Historical Situation Map</p>
              <h2>{scene.mapHeadline}</h2>
              <p className="atlas-map-card__subhead">{scene.mapHeadlineEn}</p>
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
            <p className="dossier-card__child-summary">{scene.childSummary}</p>
            <div className="dossier-card__spotlight">
              <span>先看地图</span>
              <strong>{scene.childSpotlight}</strong>
            </div>
            <div className="dossier-inline-meta">
              {scene.yearTags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>

          <div className="dossier-card dossier-card--focus">
            <p className="atlas-panel-kicker">先看地图哪里 / Read The Map First</p>
            <ol className="focus-list">
              {scene.mapFocus.map((item) => (
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
                    {scene.readingKeys.map((signal) => (
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
              <h3>从东汉失稳到三国形成</h3>
            </div>
            <span className="timeline-card__state">按顺序读下去</span>
          </div>
          <div className="timeline-rail">
            {milestones.map((milestone, index) => (
              <button
                key={milestone.year}
                className={`timeline-stop timeline-stop--${milestone.status}`}
                disabled={!milestone.interactive}
                onClick={() => milestone.interactive && setSelectedYear(milestone.year)}
                type="button"
              >
                <span className="timeline-stop__year">{milestone.year}</span>
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
              {selectedQuestion + 1} / {event.questions.length}
            </span>
          </div>

          <div className="prompt-card__question">
            <span className="prompt-card__badge">问题</span>
            <p>{currentPrompt}</p>
          </div>

          <div className="prompt-card__tabs">
            {event.questions.map((question, index) => (
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
