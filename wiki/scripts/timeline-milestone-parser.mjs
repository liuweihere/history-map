// 生产解析函数：从课程时间线表格行构建带持久 milestone_id 的里程碑列表。
//
// 设计依据 PLAN.md V3 §5/§7/§8：
// - milestone_id 在课程源维护，独立持久，禁止凭年份标题派生。
// - 修改标题和年份与重排不改变身份（ID 从源列读取，非内容派生）。
// - 导出校验缺失/重复清楚报错。
// - 旧 story_id 行为不破坏。
//
// 此模块为无 zod/无 TypeScript 依赖的纯函数，供 export-history-data.ts
// 和测试共同调用（正式可调用生产解析函数）。

/**
 * 从 timelineRows 构建里程碑列表。
 *
 * @param {Array<Record<string,string>>} timelineRows - 解析后的表格行
 * @param {Map<string,"placeholder"|"unknown">} narrationByStoryId - story_id → 口述状态
 * @returns {Array<object>} 里程碑列表（含 milestone_id, render_key, year, label 等）
 * @throws {Error} 缺失或重复 milestone_id 时报错（清楚列出冲突行）
 */
export function buildTimelineMilestones(timelineRows, narrationByStoryId) {
  const rows = Array.isArray(timelineRows) ? timelineRows : [];
  if (rows.length === 0) {
    throw new Error("timeline-rail milestone_id 校验失败:\n  时间线表格为空");
  }

  // 第一遍：解析行 + 校验 milestone_id 存在性
  const parsed = rows.map((row, index) => {
    const year = Number(row["年份"]);
    if (!Number.isInteger(year)) {
      throw new Error(`timeline-rail 校验失败: 行 ${index + 1} 年份非法 "${row["年份"]}"`);
    }

    const rawMilestoneId = row["milestone_id"]?.trim() || "";
    if (!rawMilestoneId) {
      throw new Error(
        `timeline-rail milestone_id 校验失败:\n  行 ${index + 1} (year=${year}, label="${row["事件"]?.trim() || "?"}") 缺少 milestone_id`,
      );
    }

    const storyId = row["story_id"]?.trim() || null;
    const storyStatusRaw = row["故事状态"]?.trim() || (storyId ? "recorded" : "planned");
    const regionId = row["region_id"]?.trim() || null;
    const label = stripWikiMarkup(row["事件"]?.trim() || "未命名节点");

    const narrationStatus = storyId
      ? (narrationByStoryId?.get(storyId) ?? "unknown")
      : "unknown";

    return {
      milestone_id: rawMilestoneId,
      year,
      period: stripWikiMarkup(row["时代"]?.trim() || "历史时间轴"),
      label,
      note: stripWikiMarkup(row["时间轴提示"]?.trim() || row["地图变化"]?.trim() || "历史节点"),
      lesson: stripWikiMarkup(row["孩子要理解"]?.trim() || row["结果"]?.trim() || "理解这个历史节点的位置"),
      story_id: storyId,
      story_status: storyStatusRaw,
      narration_status: narrationStatus,
      region_id: regionId,
      _rowIndex: index,
    };
  });

  // 第二遍：校验 milestone_id 唯一性
  const seenIds = new Map();
  const duplicateErrors = [];
  for (const m of parsed) {
    const prev = seenIds.get(m.milestone_id);
    if (prev !== undefined) {
      duplicateErrors.push(
        `milestone_id "${m.milestone_id}" 重复：行 ${prev + 1} 与行 ${m._rowIndex + 1}`,
      );
    } else {
      seenIds.set(m.milestone_id, m._rowIndex);
    }
  }
  if (duplicateErrors.length > 0) {
    throw new Error(
      `timeline-rail milestone_id 校验失败:\n  ${duplicateErrors.join("\n  ")}`,
    );
  }

  // 第三遍：构建最终里程碑（render_key = milestone_id，全部唯一无需后缀）
  return parsed.map(({ _rowIndex, ...milestone }) => ({
    ...milestone,
    render_key: milestone.milestone_id,
    duplicate: false,
    duplicate_index: 0,
    duplicate_count: 1,
  }));
}

function stripWikiMarkup(value) {
  return value
    .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_match, target, _pipe, alias) => {
      return alias ?? target;
    })
    .trim();
}
