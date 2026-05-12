"use client";

import { useState } from "react";

import { HistoryMapStage } from "./history-map-stage";

const futureMilestones = [
  { year: 184, label: "黄巾起义", status: "active", note: "乱世起点" },
  { year: 190, label: "董卓进京", status: "upcoming", note: "中央崩塌" },
  { year: 200, label: "官渡之战", status: "upcoming", note: "北方重排" },
  { year: 208, label: "赤壁之战", status: "upcoming", note: "南北分岔" },
  { year: 214, label: "刘备入蜀", status: "upcoming", note: "蜀地成形" },
  { year: 220, label: "曹丕代汉", status: "upcoming", note: "东汉终结" },
  { year: 221, label: "刘备称帝", status: "upcoming", note: "蜀汉建立" },
  { year: 229, label: "孙权称帝", status: "upcoming", note: "三国定局" },
];

const mapSignals = [
  { label: "东汉版图仍统一", value: "疆域仍在，秩序先裂" },
  { label: "起义并非局部小事", value: "影响多州郡，中央应对吃力" },
  { label: "三国尚未出现", value: "但群雄时代的土壤已经形成" },
];

function certaintyLabel(level) {
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

export function HistoryAtlasApp({ event, story }) {
  const [selectedQuestion, setSelectedQuestion] = useState(0);

  const currentPrompt = event.questions[selectedQuestion] ?? event.questions[0];

  return (
    <main className="atlas-shell">
      <div className="atlas-shell__grain" />

      <header className="atlas-masthead">
        <div className="atlas-masthead__title">
          <p className="atlas-kicker">Little Star History Atlas · Chronicle I</p>
          <div className="atlas-heading-row">
            <span className="atlas-year-mark">{story.timeline.year}</span>
            <h1>{event.title}</h1>
          </div>
          <p className="atlas-deck">
            东汉的疆域没有立刻破碎，但政治秩序先出现了裂缝。黄巾起义是这张历史地图开始失稳的第一道大波纹。
          </p>
        </div>

        <div className="atlas-meta">
          <div>
            <span>Period</span>
            <strong>{event.period}</strong>
          </div>
          <div>
            <span>Map Certainty</span>
            <strong>{certaintyLabel(story.map_plan.certainty)}</strong>
          </div>
          <div>
            <span>Source Mode</span>
            <strong>{event.review_status}</strong>
          </div>
        </div>
      </header>

      <section className="atlas-hero">
        <article className="atlas-map-card">
          <div className="atlas-map-card__header">
            <div>
              <p className="atlas-panel-kicker">Historical Situation Map</p>
              <h2>Empire still intact, authority under strain</h2>
            </div>
            <div className="atlas-map-card__badge">
              <span>示意图</span>
              <strong>{story.timeline.label}</strong>
            </div>
          </div>

          <div className="atlas-map-stage">
            <HistoryMapStage story={story} />
            <div className="atlas-frame atlas-frame--top" />
            <div className="atlas-frame atlas-frame--right" />
            <div className="atlas-frame atlas-frame--bottom" />
            <div className="atlas-frame atlas-frame--left" />

            <div className="atlas-latband atlas-latband--north">北方 / North</div>
            <div className="atlas-latband atlas-latband--south">南方 / South</div>
            <div className="atlas-compass">
              <span>N</span>
            </div>

            <svg
              className="atlas-silhouette"
              viewBox="0 0 1200 760"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M203 516C180 451 188 351 243 266C309 163 421 98 557 90C704 81 841 139 928 242C1004 332 1031 455 993 554C954 656 861 711 740 711C646 711 579 685 495 660C404 633 284 600 203 516Z"
                className="atlas-silhouette__land"
              />
              <path
                d="M406 137C507 110 621 111 723 149C809 180 896 241 954 332"
                className="atlas-silhouette__ridge"
              />
              <path
                d="M334 442C451 445 581 477 688 525C780 567 861 617 920 671"
                className="atlas-silhouette__river"
              />
              <path
                d="M352 292C450 285 545 306 624 360"
                className="atlas-silhouette__river atlas-silhouette__river--secondary"
              />
              <path
                d="M635 174C722 188 806 226 873 289"
                className="atlas-silhouette__route"
              />
              <path
                d="M733 182C763 188 799 210 830 239"
                className="atlas-silhouette__route atlas-silhouette__route--minor"
              />
              <path
                d="M767 102C822 123 883 164 932 216"
                className="atlas-silhouette__coast"
              />
              <ellipse cx="719" cy="220" rx="92" ry="69" className="atlas-silhouette__disturbance" />
              <ellipse
                cx="787"
                cy="264"
                rx="70"
                ry="49"
                className="atlas-silhouette__disturbance atlas-silhouette__disturbance--soft"
              />
            </svg>

            <div className="atlas-grid atlas-grid--vertical" />
            <div className="atlas-grid atlas-grid--horizontal" />

            <div className="atlas-region atlas-region--central">中原 / Central Plain</div>
            <div className="atlas-region atlas-region--hebei">冀州地带 / Hebei Zone</div>
            <div className="atlas-region atlas-region--han">东汉中央秩序</div>

            <div className="atlas-disturbance-text atlas-disturbance-text--one">黄巾起义扩散带</div>
            <div className="atlas-disturbance-text atlas-disturbance-text--two">中央受损</div>

            <div className="atlas-stage-legend">
              <span>
                <i className="atlas-stage-legend__swatch atlas-stage-legend__swatch--han" />
                东汉秩序区
              </span>
              <span>
                <i className="atlas-stage-legend__swatch atlas-stage-legend__swatch--uprising" />
                动乱与起义压力
              </span>
              <span>
                <i className="atlas-stage-legend__swatch atlas-stage-legend__swatch--river" />
                主要河流与交通线
              </span>
            </div>

            <div className="atlas-map-caption">
              <p>
                这不是精确军政边界图，而是帮助孩子理解“帝国仍在、秩序已裂”的历史状态图。
              </p>
            </div>
          </div>
        </article>

        <aside className="atlas-side-panel">
          <div className="dossier-card dossier-card--lead">
            <p className="atlas-panel-kicker">This Year</p>
            <h3>{story.timeline.lesson}</h3>
            <p>{event.child_summary}</p>
          </div>

          <div className="dossier-card">
            <p className="atlas-panel-kicker">Reading Keys</p>
            <ul className="signal-list">
              {mapSignals.map((signal) => (
                <li key={signal.label}>
                  <strong>{signal.label}</strong>
                  <span>{signal.value}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="dossier-card">
            <p className="atlas-panel-kicker">Forces on Stage</p>
            <div className="faction-table">
              {story.factions.map((faction) => (
                <div key={faction.id} className="faction-row">
                  <span className="faction-row__name">{faction.name}</span>
                  <span className="faction-row__tone">{faction.color}</span>
                </div>
              ))}
              {story.people.map((person) => (
                <div key={person.id} className="faction-row faction-row--person">
                  <span className="faction-row__name">{person.name}</span>
                  <span className="faction-row__tone">{person.role}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="dossier-card dossier-card--sources">
            <p className="atlas-panel-kicker">Source Trail</p>
            <div className="source-list">
              {event.source_refs.map((source) => (
                <span key={source}>{source}</span>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="atlas-lower">
        <div className="timeline-card">
          <div className="timeline-card__header">
            <div>
              <p className="atlas-panel-kicker">Historical Rail</p>
              <h3>From late Han instability to the Three Kingdoms</h3>
            </div>
            <span className="timeline-card__state">Sequential interpretation</span>
          </div>
          <div className="timeline-rail">
            {futureMilestones.map((milestone, index) => (
              <div
                key={milestone.year}
                className={`timeline-stop timeline-stop--${milestone.status}`}
              >
                <span className="timeline-stop__year">{milestone.year}</span>
                <span className="timeline-stop__label">{milestone.label}</span>
                <span className="timeline-stop__note">{milestone.note}</span>
                {index < futureMilestones.length - 1 ? <i className="timeline-stop__bar" /> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="prompt-card">
          <div className="prompt-card__header">
            <div>
              <p className="atlas-panel-kicker">Family Prompt Deck</p>
              <h3>看地图，再问问题</h3>
            </div>
            <span>
              {selectedQuestion + 1} / {event.questions.length}
            </span>
          </div>

          <div className="prompt-card__question">
            <span className="prompt-card__badge">Question</span>
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
            <p className="atlas-panel-kicker">Historical Result</p>
            <p>{event.result}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
