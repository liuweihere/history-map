"use client";

import React, { useRef, useState } from "react";

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
} from "../lib/jiangshan-time";

/**
 * 底部朝代比例时间轴（PLAN.md V3 §2/§3）。
 *
 * - 按真实年数比例的连续刻度（序号无零年）；
 * - 任意有效整数年份（前403—1948），无 0 年；
 * - 提供「上一年 / 下一年」「上一阶段 / 下一阶段」+ 年份输入；
 * - 朝代段按真实 from/to 宽度排布，不人为扩宽暗示时长；
 * - 短朝代可隐藏文字标签（通过列表/输入选择，不强行塞标签）。
 *
 * @param {object} index  jiangshan index（dynasties[{key,title,from,to,phases}]）
 * @param {number} selectedYear
 * @param {function} onYearChange  (year:number) => void
 * @param {function|null} onPhaseStep  (direction:+1|-1) => void  上一/下一阶段
 */
export function DynastyTimeline({ index, selectedYear, onYearChange, onPhaseStep }) {
  const trackRef = useRef(null);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");

  const dynasties = Array.isArray(index?.dynasties) ? index.dynasties : [];
  const minOrd = yearToOrdinal(JIANGSHAN_MIN_YEAR);
  const maxOrd = yearToOrdinal(JIANGSHAN_MAX_YEAR);
  const span = maxOrd - minOrd; // 序号跨度

  const year = clampYear(selectedYear);
  const yearOrd = yearToOrdinal(year);
  const ratio = (yearOrd - minOrd) / span;
  const pct = `${(ratio * 100).toFixed(2)}%`;

  const setYear = (ny) => {
    const c = clampYear(ny);
    if (c === year) return;
    onYearChange?.(c);
  };

  // 朝代段：按 from/to 真实宽度（序号比例）排布
  const dynastySegments = dynasties
    .map((d) => {
      const lo = yearToOrdinal(clampYear(d.from));
      const hi = yearToOrdinal(clampYear(d.to));
      if (lo === null || hi === null) return null;
      const left = ((lo - minOrd) / span) * 100;
      const width = ((hi - lo) / span) * 100;
      const showLabel = width >= 4; // 足够宽才显示文字
      return { key: d.key, title: d.title, left, width, showLabel };
    })
    .filter(Boolean);

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
          <span className="dynasty-timeline__year">{formatYear(year)}</span>
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
        <div className="dynasty-timeline__rail" aria-hidden="true" />

        {/* 朝代段：按真实宽度，不堆色块（极淡底纹仅作定位参照）*/}
        {dynastySegments.map((seg) => (
          <div
            key={seg.key}
            className="dynasty-timeline__seg"
            style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
            title={seg.title}
          >
            {seg.showLabel ? <span className="dynasty-timeline__seg-label">{seg.title}</span> : null}
          </div>
        ))}

        {/* 当前年份指针 */}
        <div className="dynasty-timeline__pin" style={{ left: pct }}>
          <span className="dynasty-timeline__flag" aria-hidden="true">{formatYear(year)}</span>
          <span className="dynasty-timeline__thumb" aria-hidden="true" />
        </div>
      </div>
    </div>
  );

  function pickYear(clientX) {
    const rect = trackRef.current.getBoundingClientRect();
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const ord = Math.round(minOrd + r * span);
    const y = clampYear(ordinalToYear(ord));
    setYear(y);
  }
}
