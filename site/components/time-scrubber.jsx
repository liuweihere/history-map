"use client";

import { useRef, useState } from "react";

function formatYear(year) {
  if (year < 0) return `前${Math.abs(year)}`;
  return String(year);
}

export function TimeScrubber({ milestones, docked, onDock, onYearChange }) {
  const trackRef = useRef(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const total = milestones.length;
  if (!total) return null;

  const activeIndex = Math.max(0, milestones.indexOf(docked));
  const previewIndex = dragIndex ?? hoverIndex ?? activeIndex;
  const isDragging = dragIndex !== null;

  const indexFromClientX = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.min(total - 1, Math.max(0, Math.round(ratio * total - 0.5)));
  };

  const dragTo = (clientX) => {
    const index = indexFromClientX(clientX);
    setDragIndex(index);
    // 拖动过程中实时通知年份变化（预览/联动地图节点）
    onYearChange?.(milestones[index], index);
  };

  const endDrag = () => {
    if (dragIndex !== null) {
      onDock(milestones[dragIndex], true);
      setDragIndex(null);
    }
  };

  const pos = (i) => ((i + 0.5) / total) * 100;

  // 相邻同朝代的里程碑合并成 span：仅用于计算朝代名文字标签的位置，不再渲染背景色块
  const eraSpans = [];
  milestones.forEach((milestone, index) => {
    const lastSpan = eraSpans[eraSpans.length - 1];
    if (lastSpan && lastSpan.period === milestone.period) {
      lastSpan.last = index;
    } else {
      eraSpans.push({ period: milestone.period, first: index, last: index });
    }
  });
  const eraLabelVisible = (span) => (span.last - span.first + 1) / total >= 0.045;
  const eraMidPos = (span) => (((span.first + span.last + 1) / 2 / total) * 100);

  return (
    <div className={`time-scrubber${isDragging ? " time-scrubber--dragging" : ""}`}>
      <div
        className="time-scrubber__track"
        role="slider"
        aria-label="历史时间滑杆"
        aria-valuemin={0}
        aria-valuemax={total - 1}
        aria-valuenow={activeIndex}
        aria-valuetext={`${formatYear(milestones[previewIndex].year)} ${milestones[previewIndex].label}`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onDock(milestones[Math.max(0, activeIndex - 1)], true);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onDock(milestones[Math.min(total - 1, activeIndex + 1)], true);
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragTo(event.clientX);
        }}
        onPointerUp={endDrag}
        onPointerCancel={() => setDragIndex(null)}
      >
        {/* 测量/定位层：扣除轨道容器左右 padding 后的净宽区域 */}
        <div
          ref={trackRef}
          className="time-scrubber__inner"
          onPointerMove={(event) => {
            if (dragIndex !== null) {
              dragTo(event.clientX);
            } else {
              setHoverIndex(indexFromClientX(event.clientX));
            }
          }}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {/* 贯穿中轴线：全宽 2px 细线，垂直居中 */}
          <div className="time-scrubber__rail" aria-hidden="true" />

          {/* 刻度点层：钉在轴线上（top:50% 居中），悬停显示年份+故事名+朝代 */}
          {milestones.map((milestone, index) => (
            <span
              key={`${milestone.year}-${milestone.label}`}
              className={[
                "time-scrubber__tick",
                milestone.interactive ? "time-scrubber__tick--recorded" : "",
                index === activeIndex ? "is-active" : "",
                index === previewIndex ? "is-preview" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ left: `${pos(index)}%` }}
              title={`${formatYear(milestone.year)} ${milestone.label}（${milestone.period}）`}
            />
          ))}

          {/* 朝代名文字层：轴线下方、span 中点水平居中，仅显示足够宽的朝代 */}
          {eraSpans.filter(eraLabelVisible).map((span) => (
            <span
              key={`${span.period}-${span.first}`}
              className="time-scrubber__era-label"
              style={{ left: `${eraMidPos(span)}%` }}
            >
              {span.period}
            </span>
          ))}

          {/* 滑块：44px 透明热区 + 20px 圆点 + 正上方暗色年份气泡 */}
          <div
            className={`time-scrubber__pin${isDragging ? " time-scrubber__pin--dragging" : ""}`}
            style={{ left: `${pos(previewIndex)}%` }}
          >
            <span className="time-scrubber__flag" aria-hidden="true">
              {formatYear(milestones[previewIndex].year)}
            </span>
            <span
              className={`time-scrubber__thumb${isDragging ? " is-grabbing" : ""}`}
              aria-label={`拖动时间滑块，当前 ${formatYear(milestones[previewIndex].year)} ${milestones[previewIndex].label}`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragIndex(previewIndex);
              }}
              onPointerMove={(event) => {
                if (dragIndex !== null) {
                  dragTo(event.clientX);
                }
              }}
              onPointerUp={endDrag}
              onPointerCancel={() => setDragIndex(null)}
            >
              <span className="time-scrubber__headpin" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
