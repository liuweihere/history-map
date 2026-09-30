"use client";

const FLOW_TONES = ["people", "place", "turn", "ending"];

export function StoryNarrationFlow({ story }) {
  const steps = story.narration_flow ?? [];
  if (steps.length === 0) {
    return (
      <div className="narration-flow narration-flow--empty">
        <div className="narration-flow__hint">
          <span>讲述脉络待生成</span>
        </div>
      </div>
    );
  }

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

export function StoryMindMap({ story }) {
  return <StoryNarrationFlow story={story} />;
}
