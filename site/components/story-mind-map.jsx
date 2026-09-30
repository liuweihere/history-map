"use client";

const BRANCH_LAYOUT = [
  { key: "people", label: "人物", angle: -52, tone: "people" },
  { key: "places", label: "地点", angle: 232, tone: "place" },
  { key: "turns", label: "转折", angle: 128, tone: "turn" },
  { key: "ending", label: "结局", angle: 52, tone: "ending" },
];

function branchItems(key, { story, event }) {
  switch (key) {
    case "people":
      return [
        ...story.people.map((p) => `${p.name}（${p.role}）`),
        ...story.factions.map((f) => `${f.name}`),
      ];
    case "places":
      return story.places.map((p) => p.name);
    case "turns":
      return story.panel.year_tags ?? [];
    case "ending":
      return (event.result ?? "").split("；").slice(0, 3);
    default:
      return [];
  }
}

const FLOW_TONES = ["people", "place", "turn", "ending"];

export function StoryNarrationFlow({ story }) {
  const steps = story.narration_flow ?? [];
  if (steps.length === 0) return null;

  return (
    <ol className="narration-flow">
      {steps.map((step, index) => (
        <li key={step.label} className={`narration-flow__step narration-flow__step--${FLOW_TONES[index % FLOW_TONES.length]}`}>
          <span className="narration-flow__badge">{String(index + 1).padStart(2, "0")}</span>
          <div className="narration-flow__body">
            <strong className="narration-flow__label">{step.label}</strong>
            <span className="narration-flow__value">{step.value}</span>
          </div>
        </li>
      ))}
      <li className="narration-flow__hint">
        <span>照着这个顺序，把故事讲给爸爸妈妈听 ▸</span>
      </li>
    </ol>
  );
}

export function StoryMindMap({ story, event, scene }) {
  const flowSteps = story.narration_flow ?? [];

  if (flowSteps.length > 0) {
    return <StoryNarrationFlow story={story} />;
  }

  const center = event.title;
  const radius = 118;

  const branches = BRANCH_LAYOUT.map((branch) => ({
    ...branch,
    items: branchItems(branch.key, { story, event }).slice(0, 4),
  })).filter((branch) => branch.items.length > 0);

  return (
    <div className="mindmap">
      <svg
        className="mindmap__svg"
        viewBox="0 0 560 460"
        role="img"
        aria-label={`故事思维导图：${center}`}
      >
        {branches.map((branch) => {
          const rad = (branch.angle * Math.PI) / 180;
          const bx = 280 + Math.cos(rad) * radius;
          const by = 230 + Math.sin(rad) * radius;
          const mx = 280 + Math.cos(rad) * 66;
          const my = 230 + Math.sin(rad) * 66;

          return (
            <g key={branch.key}>
              <path
                d={`M ${280} ${230} Q ${mx} ${my} ${bx} ${by}`}
                className={`mindmap__link mindmap__link--${branch.tone}`}
              />
              <circle cx={bx} cy={by} r="5" className={`mindmap__node mindmap__node--${branch.tone}`} />
              <text
                x={bx + (Math.cos(rad) >= 0 ? 10 : -10)}
                y={by - 8}
                textAnchor={Math.cos(rad) >= 0 ? "start" : "end"}
                className={`mindmap__branch-label mindmap__branch-label--${branch.tone}`}
              >
                {branch.label}
              </text>
              {branch.items.map((item, index) => (
                <text
                  key={item}
                  x={bx + (Math.cos(rad) >= 0 ? 10 : -10)}
                  y={by + 10 + index * 18}
                  textAnchor={Math.cos(rad) >= 0 ? "start" : "end"}
                  className="mindmap__leaf"
                >
                  {item.length > 14 ? `${item.slice(0, 13)}…` : item}
                </text>
              ))}
            </g>
          );
        })}

        <circle cx="280" cy="230" r="7" className="mindmap__hub-dot" />
        <circle cx="280" cy="230" r="52" className="mindmap__hub-ring" />
        <circle cx="280" cy="230" r="62" className="mindmap__hub-ring mindmap__hub-ring--outer" />
        <text x="280" y="226" textAnchor="middle" className="mindmap__hub-title">
          {center.length > 7 ? center.slice(0, 7) : center}
        </text>
        <text x="280" y="246" textAnchor="middle" className="mindmap__hub-sub">
          {scene.meta_label}
        </text>
      </svg>
    </div>
  );
}
