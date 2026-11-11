"use client";

import React, { useMemo, useRef, useState } from "react";

import {
  JIANGSHAN_MIN_YEAR,
  JIANGSHAN_MAX_YEAR,
  isValidYear,
  yearToOrdinal,
  ordinalToYear,
  nextYear,
  prevYear,
  clampYear,
  formatYear,
  parseYear,
} from "../lib/jiangshan-time.js";
import {
  buildBands,
  findBandIndex,
  yearToProgress,
  progressToYearOrd,
  bandLabelClass,
} from "../lib/dynasty-bands.js";

/**
 * 底部朝代色带时间轴 —— 江山时序（jiangshan-map）上游实现的对照移植
 * （index.html #scrubber-dock / css .band-cell / js _buildScrubberBands）。
 * 布局与视觉以上游为准，不自行设计：
 *
 * - 全宽底栏：控制组 + 轨道（34px 朝代色带）+ 刻度行；
 * - 朝代色带 background = 该朝代 tint（index.json 携带），白字 + 文字阴影，
 *   opacity .72，当前朝代 is-active（opacity 1 + saturate）；
 * - 年份气泡在轨道上方（深色底），4px 竖条手柄贯穿轨道；
 * - 带内：阶段刻度（phases>1 的相邻边界）+ 里程碑事件点（clamp 3..97 去重）；
 * - 刻度行：各朝代起点年 + 末年；
 * - 点击/回车朝代带 → 跳到该朝代起始年（上游 focusYear ?? fromYear 语义）；
 * - 拖动/点击轨道 → 分段线性反解年份（lib/dynasty-bands.js，无零年）；
 * - 保留本站控制：上/下一年、上/下一阶段、年份输入跳转（不静默 clamp）。
 *
 * @param {object} index  jiangshan index（dynasties[{key,title,tint,from,to,phases}]）
 * @param {object|null} milestones  milestones.geojson（事件点；可选）
 * @param {number} selectedYear
 * @param {function} onYearChange  (year:number) => void
 * @param {function|null} onPhaseStep  (direction:+1|-1) => void  上一/下一阶段
 */
export function DynastyTimeline({ index, milestones, selectedYear, onYearChange, onPhaseStep }) {
  const trackRef = useRef(null);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");

  const model = useMemo(() => buildBands(index?.dynasties), [index]);
  const { bands, totalWeight } = model;

  const year = clampYear(selectedYear);
  const yearOrd = yearToOrdinal(year);
  const progress = bands.length ? yearToProgress(model, yearOrd) : 0;
  const pct = `${(progress * 100).toFixed(3)}%`;

  const activeIdx = bands.length ? findBandIndex(bands, yearOrd) : -1;
  const activeBand = activeIdx >= 0 ? bands[activeIdx] : null;

  // 事件点按朝代归入带（properties.dynasty + year）
  const yearsByBand = useMemo(() => {
    const map = new Map();
    for (const f of milestones?.features ?? []) {
      const p = f?.properties ?? {};
      if (!p.dynasty || !Number.isInteger(p.year)) continue;
      if (!map.has(p.dynasty)) map.set(p.dynasty, []);
      map.get(p.dynasty).push(p.year);
    }
    return map;
  }, [milestones]);

  const setYear = (ny) => {
    const c = clampYear(ny);
    if (c === null || c === year) return;
    onYearChange?.(c);
  };

  const handleInputSubmit = () => {
    const parsed = parseYear(inputValue);
    if (parsed === null) {
      setInputError("无法识别年份，试试「前220」或「220」");
      return;
    }
    if (parsed === 0) {
      setInputError("没有公元 0 年（前 1 年之后是公元 1 年）");
      return;
    }
    if (!isValidYear(parsed)) {
      setInputError(
        `年份超出范围：可探索 ${formatYear(JIANGSHAN_MIN_YEAR)} — ${formatYear(JIANGSHAN_MAX_YEAR)}`,
      );
      return;
    }
    setInputError("");
    onYearChange?.(parsed);
    setInputValue("");
  };

  const canPrev = prevYear(year) !== null;
  const canNext = nextYear(year) !== null;

  return (
    <div className="dynasty-timeline" role="group" aria-label="朝代时间轴">
      <div className="dynasty-timeline__controls">
        <button
          type="button"
          className="dynasty-timeline__btn"
          onClick={() => { const p = prevYear(year); if (p !== null) setYear(p); }}
          disabled={!canPrev}
          aria-label="上一年"
          title="上一年"
        >
          ‹ 年
        </button>
        <button
          type="button"
          className="dynasty-timeline__btn dynasty-timeline__btn--phase"
          onClick={() => onPhaseStep?.(-1)}
          aria-label="上一阶段"
          title="上一阶段"
        >
          ‹ 阶段
        </button>

        <div className="dynasty-timeline__yearbox">
          <input
            type="text"
            className="dynasty-timeline__input"
            placeholder="输入年份，如 前220"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleInputSubmit(); }}
            aria-label="输入年份"
          />
          <button
            type="button"
            className="dynasty-timeline__go"
            onClick={handleInputSubmit}
          >
            跳转
          </button>
        </div>
        {inputError ? (
          <span className="dynasty-timeline__input-error" role="alert">
            {inputError}
          </span>
        ) : null}

        <button
          type="button"
          className="dynasty-timeline__btn dynasty-timeline__btn--phase"
          onClick={() => onPhaseStep?.(1)}
          aria-label="下一阶段"
          title="下一阶段"
        >
          阶段 ›
        </button>
        <button
          type="button"
          className="dynasty-timeline__btn"
          onClick={() => { const n = nextYear(year); if (n !== null) setYear(n); }}
          disabled={!canNext}
          aria-label="下一年"
          title="下一年"
        >
          年 ›
        </button>
      </div>

      <div className="dynasty-timeline__rail-wrap">
        {/* 年份气泡：轨道上方（上游 #scrubber-Bubble：深色底 + 向下小三角）*/}
        <div className="dynasty-timeline__bubble" style={{ left: pct }} aria-live="polite">
          {formatYear(year)}{activeBand ? ` · ${activeBand.title}` : ""}
        </div>

        <div
          ref={trackRef}
          className="dynasty-timeline__track"
          role="slider"
          aria-label="年份滑杆"
          aria-valuemin={JIANGSHAN_MIN_YEAR}
          aria-valuemax={JIANGSHAN_MAX_YEAR}
          aria-valuenow={year}
          aria-valuetext={formatYear(year)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); const p = prevYear(year); if (p !== null) setYear(p); }
            if (e.key === "ArrowRight") { e.preventDefault(); const n = nextYear(year); if (n !== null) setYear(n); }
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pickYear(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) pickYear(e.clientX);
          }}
        >
          {/* 朝代色带（上游 #dynasty-bands：flex，cell flex=weight，background=tint）*/}
          <div className="dynasty-timeline__bands">
            {bands.map((b, i) => {
              const cls = [
                "dynasty-timeline__band",
                bandLabelClass(b.weight / totalWeight),
                i === activeIdx ? "is-active" : "",
              ].filter(Boolean).join(" ");

              // 阶段刻度：相邻 phase 的 from 边界（首 phase 除外），落在带内才渲染
              const span = Math.max(1, b.toOrd - b.fromOrd);
              const phases = index?.dynasties?.[i]?.phases ?? [];
              const phaseBoundaries = [];
              for (let k = 1; k < phases.length; k++) {
                const u = phases[k].from;
                if (u > b.from && u < b.to) phaseBoundaries.push(u);
              }

              // 事件点：clamp 3..97 + 按 pct 去重（上游 band-ev-dot 同款）
              const dots = [];
              const seen = new Set();
              for (const y of yearsByBand.get(b.key) ?? []) {
                if (y < b.from || y > b.to) continue;
                const p = Math.max(3, Math.min(97, Math.round(((yearToOrdinal(y) - b.fromOrd) / span) * 100)));
                if (seen.has(p)) continue;
                seen.add(p);
                dots.push(p);
              }

              return (
                <div
                  key={b.key}
                  className={cls}
                  style={{ flex: `${b.weight} 1 0`, background: b.tint }}
                  role="button"
                  tabIndex={0}
                  title={`${b.title}（${formatYear(b.from)}—${formatYear(b.to)}）`}
                  aria-label={`跳到${b.title}（${formatYear(b.from)}年）`}
                  onClick={() => setYear(b.from)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setYear(b.from);
                    }
                  }}
                >
                  <span className="dynasty-timeline__band-label">{b.title}</span>
                  {phaseBoundaries.map((u) => (
                    <i
                      key={u}
                      className="dynasty-timeline__phase-tick"
                      style={{ left: `${(((yearToOrdinal(u) - b.fromOrd) / span) * 100).toFixed(2)}%` }}
                      aria-hidden="true"
                    />
                  ))}
                  {dots.map((p) => (
                    <i key={p} className="dynasty-timeline__ev-dot" style={{ left: `${p}%` }} aria-hidden="true" />
                  ))}
                </div>
              );
            })}
          </div>

          {/* 4px 竖条手柄（上游 #scrubber-handle：top/bottom 溢出 6px + 浅色描边）*/}
          <div className="dynasty-timeline__handle" style={{ left: pct }} aria-hidden="true" />
        </div>

        {/* 刻度行：各朝代起点年 + 末年（上游 #scrubber-ticks）*/}
        <div className="dynasty-timeline__ticks" aria-hidden="true">
          {bands.map((b) => (
            <span key={b.key} style={{ left: `${(b.offset * 100).toFixed(3)}%` }}>
              {formatYear(b.from)}
            </span>
          ))}
          {bands.length ? (
            <span className="dynasty-timeline__tick-end" style={{ left: "100%" }}>
              {formatYear(bands[bands.length - 1].to)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  function pickYear(clientX) {
    const rect = trackRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const frac = (clientX - rect.left) / rect.width;
    const y = clampYear(ordinalToYear(progressToYearOrd(model, frac)));
    setYear(y);
  }
}
