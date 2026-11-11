"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { ExplorationMapStage } from "./exploration-map-stage";
import { DynastyTimeline } from "./dynasty-timeline";
import { ExplorationDrawer } from "./exploration-drawer";
import {
  clampYear,
  formatYear,
  nextYear,
  prevYear,
} from "../lib/jiangshan-time";
import {
  fetchJiangshanIndex,
  fetchCorridors,
  fetchMilestones,
  fetchBridge,
  resolveDynasty,
  resolvePhase,
  phaseCacheKey,
  snapshotUrlForPhase,
  milestonesForDynasty,
  createSnapshotCache,
} from "../lib/jiangshan-data.js";

/**
 * 探索状态编排（PLAN.md V3 §2 探索状态）。
 *
 * 数据加载策略（§5 地图与状态验收）：
 * - index / corridors / milestones / bridge 一次加载常驻；
 * - 政权快照按 phase 缓存（createSnapshotCache），同 phase 不重复加载，
 *   跨 phase 才请求，stale 请求取消，快速切换旧请求不覆盖新选择；
 * - selectedYear 与 resolvedPhase 独立：同 phase 换年只更新走廊过滤，
 *   不重新获取快照（§3）。
 * - 数据缺失（Phase 1 未交付）时显示友好提示，保留故事入口，不造数据。
 *
 * @param {array} entries  本站故事条目（来自 getChronicleData）
 * @param {function} onEnterStory  (storyId, exploreSnapshot) => void  点击故事 → 进入故事状态
 * @param {function|null} onGoToStories  () => void  数据缺失时进入故事目录
 * @param {function|null} onCameraChange  (camera) => void  视角变化上报（父级持有最新视角）
 * @param {object|null} restoredState  从故事返回时恢复的探索现场
 * @param {function} onStateChange  (state) => void  记录探索现场供往返恢复
 */
export function ExplorationStage({ entries, onEnterStory, onGoToStories, onCameraChange, restoredState, onStateChange }) {
  const [index, setIndex] = useState(null);
  const [indexError, setIndexError] = useState(null);
  const [corridors, setCorridors] = useState(null);
  const [milestones, setMilestones] = useState(null);
  const [bridge, setBridge] = useState({ entries: [] });

  const [selectedYear, setSelectedYear] = useState(
    clampYear(restoredState?.selectedYear ?? 220),
  );
  const [drawerOpen, setDrawerOpen] = useState(restoredState?.drawerOpen ?? false);
  const [drawerTab, setDrawerTab] = useState(restoredState?.drawerTab ?? "stories");

  const [snapshot, setSnapshot] = useState(null);
  const [snapshotError, setSnapshotError] = useState(null);
  const cacheRef = useRef(null);
  if (!cacheRef.current) cacheRef.current = createSnapshotCache(5);
  // 视角 ref（moveend 上报；进入故事前捕获，返回时恢复，避免频繁 re-render）
  const cameraRef = useRef(restoredState?.camera ?? null);
  // onStateChange 用 ref 持有，避免父组件每次渲染传入新函数引用导致 effect 无限循环。
  // 同时用上次发出的快照做浅比较，仅当 selectedYear/drawerOpen/drawerTab 真正变化时才上报。
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const lastEmittedRef = useRef(null);

  useEffect(() => {
    const next = { selectedYear, drawerOpen, drawerTab, camera: cameraRef.current };
    const prev = lastEmittedRef.current;
    if (
      prev &&
      prev.selectedYear === next.selectedYear &&
      prev.drawerOpen === next.drawerOpen &&
      prev.drawerTab === next.drawerTab
    ) {
      return; // 实际值未变，不上报（避免无限循环）
    }
    lastEmittedRef.current = next;
    onStateChangeRef.current?.(next);
  }, [selectedYear, drawerOpen, drawerTab]);

  // ── 加载 index / corridors / milestones / bridge ──────────────────
  useEffect(() => {
    const controller = new AbortController();
    let done = false;
    (async () => {
      try {
        const [idx, corr, ms, br] = await Promise.all([
          fetchJiangshanIndex(controller.signal),
          fetchCorridors(controller.signal).catch(() => null),
          fetchMilestones(controller.signal).catch(() => null),
          fetchBridge(controller.signal),
        ]);
        if (done) return;
        setIndex(idx);
        setCorridors(corr);
        setMilestones(ms);
        setBridge(br);
      } catch (err) {
        if (done) return;
        setIndexError(String(err?.message ?? err));
      }
    })();
    return () => { done = true; controller.abort(); };
  }, []);

  // 当前朝代 / 阶段（纯解析，index 变化或换年时重算）
  const dynasty = useMemo(() => resolveDynasty(index, selectedYear), [index, selectedYear]);
  const phase = useMemo(() => resolvePhase(dynasty, selectedYear), [dynasty, selectedYear]);
  const cacheKey = phaseCacheKey(dynasty, phase);

  // ── 快照加载：仅 cacheKey 变化时请求（同 phase 换年不重取）─────────
  // 跨 phase 时立即清除旧快照（stale 不呈现，§5），再发起新请求；
  // 同 phase 换年 cacheKey 不变 → 不进入此 effect → 不重取、不清空。
  useEffect(() => {
    if (!cacheKey || !phase) {
      setSnapshot(null);
      setSnapshotError(null);
      return;
    }
    // 跨 phase：先清旧快照，避免旧疆域在新年份短暂展示
    setSnapshot(null);
    setSnapshotError(null);

    let cancelled = false;
    const cache = cacheRef.current;
    // 切换 phase 时取消其他在途请求（stale 不覆盖）
    cache.cancelOthers(cacheKey);
    const url = snapshotUrlForPhase(phase);
    if (!url) {
      setSnapshotError("该阶段缺少快照文件路径");
      return;
    }
    cache
      .load(cacheKey, async (signal) => {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return; // 已被更新请求取代，不覆盖
        setSnapshot(data);
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        setSnapshotError(String(err?.message ?? err));
      });
    return () => { cancelled = true; };
  }, [cacheKey, phase]);

  // 当前朝代故事：用 index 区间判定故事年份所属朝代（§2）
  const dynastyStories = useMemo(() => {
    if (!dynasty || !entries) return [];
    return entries.filter((e) => {
      const y = e.story.timeline.year;
      return y >= dynasty.from && y <= dynasty.to;
    });
  }, [dynasty, entries]);

  const dynastyMilestones = useMemo(
    () => milestonesForDynasty(milestones, dynasty?.key),
    [milestones, dynasty],
  );

  // 阶段切换：上一/下一阶段（跨 phase 才换快照）
  const stepPhase = (direction) => {
    if (!index || !dynasty) return;
    const allPhases = [];
    for (const d of index.dynasties) {
      for (const p of d.phases ?? []) allPhases.push({ d, p });
    }
    const curIdx = allPhases.findIndex(
      ({ d, p }) => d.key === dynasty.key && p.snapshot === phase?.snapshot,
    );
    const target = allPhases[curIdx + direction];
    if (target) setSelectedYear(clampYear(target.p.from));
  };

  // 数据缺失友好提示（首屏无数据时，故事入口明显可发现）
  if (indexError && !index) {
    return (
      <div className="exploration-empty-stage">
        <div className="exploration-empty-stage__card">
          <p className="atlas-panel-kicker">时空探索 / Time Travel</p>
          <h2>历史地图数据还在准备中</h2>
          <p>
            社区适配器尚未交付江山时序数据包，自由时空漫游暂时不可用。
            你可以先阅读已录入的故事——返回后会恢复这里的年份与面板。
          </p>
          <p className="exploration-empty-stage__err" role="note">
            数据接口：{indexError}
          </p>
          {typeof onGoToStories === "function" ? (
            <button
              type="button"
              className="exploration-empty-stage__cta"
              onClick={onGoToStories}
            >
              进入故事目录 ▸
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="exploration-stage">
      <div className="exploration-stage__map">
        {index ? (
          <ExplorationMapStage
            snapshot={snapshot}
            phaseKey={cacheKey}
            corridors={corridors}
            selectedYear={selectedYear}
            initialCamera={cameraRef.current}
            onCameraChange={(cam) => {
              cameraRef.current = cam;
              // 同步给父级（用 ref 持有），供 topbar「故事目录」进入故事时读取最新视角
              onCameraChange?.(cam);
            }}
          />
        ) : (
          <div className="exploration-loading">正在加载历史地图数据…</div>
        )}

        {/* 左下阶段说明卡（§2：仅说明当前地图参考和图例，不强制修改选中年份）*/}
        <div className="exploration-phase-card">
          <p className="atlas-panel-kicker">地图参考阶段 / Phase</p>
          {dynasty && phase ? (
            <>
              <h3>{dynasty.title} · {phase.overview ?? phase.snapshot}</h3>
              <p className="exploration-phase-card__years">
                {formatYear(phase.from)} — {formatYear(phase.to)}
              </p>
              <p className="exploration-phase-card__selected">
                选择年份：{formatYear(selectedYear)}
                <span className="exploration-phase-card__note">
                  （地图按参考阶段概略复原，阶段内并非每日相同）
                </span>
              </p>
            </>
          ) : (
            <p className="exploration-phase-card__empty">
              {index
                ? `所选年份 ${formatYear(selectedYear)} 暂无对应的导航朝代区间（可尝试相邻年份）。`
                : "正在加载朝代索引…"}
            </p>
          )}
          {snapshotError ? (
            <p className="exploration-phase-card__warn" role="note">
              该阶段地图加载失败：{snapshotError}（可尝试相邻年份）
            </p>
          ) : null}
        </div>
      </div>

      <ExplorationDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((o) => !o)}
        tab={drawerTab}
        onTabChange={setDrawerTab}
        dynasty={dynasty}
        dynastyStories={dynastyStories}
        dynastyMilestones={dynastyMilestones}
        selectedYear={selectedYear}
        bridge={bridge}
        onSelectStory={(sid) =>
          onEnterStory(sid, { selectedYear, drawerOpen, drawerTab, camera: cameraRef.current })
        }
        onSelectYear={(y) => setSelectedYear(clampYear(y))}
        onFocusSite={() => {}}
      />

      <DynastyTimeline
        index={index}
        milestones={milestones}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        onPhaseStep={stepPhase}
      />
    </div>
  );
}
