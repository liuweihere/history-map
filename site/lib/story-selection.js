// 故事选择纯逻辑（Phase 0：用稳定 story_id 而非年份选择故事）。
//
// 设计依据 PLAN.md V3 §5/§7：年份是日期不是身份。同年多故事（如 199 CE
// 煮酒论英雄/望梅止渴/绝妙好辞）必须按 story_id 独立选中，互不串线；
// 同年 active 高亮也以选中 story_id 定位（不能全部点亮）。
//
// 此模块为无 React 依赖的纯函数集合，供 history-atlas-app.jsx 复用，
// 并由 test/story-selection.test.mjs 以真实数据覆盖。buildMilestones 内部
// 用 entryByStoryId Map（story_id → entry）做身份映射。
import { milestoneRegionId } from "./history-regions.js";

/**
 * 按 story_id 选取故事条目；未命中回退到首条（与原 chronicleEntries[0] 一致）。
 * 取代旧实现 `entries.find(e => e.story.timeline.year === selectedYear)`——
 * 后者在同年多故事时永远命中第一条，导致串线。
 */
export function selectEntryByStoryId(entries, storyId) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  if (typeof storyId === "string" && storyId) {
    const hit = entries.find((entry) => entry?.story?.story_id === storyId);
    if (hit) return hit;
  }
  return entries[0];
}

/**
 * 从里程碑取出其稳定故事身份。interactive 里程碑携带 story_id；
 * planned 里程碑无 story_id，返回 null（不硬造关联，保留 region preview 行为）。
 */
export function storyIdFromMilestone(milestone) {
  if (!milestone) return null;
  if (typeof milestone.story_id === "string" && milestone.story_id) {
    return milestone.story_id;
  }
  return null;
}

/**
 * 按 story_id 选取 docked 里程碑。同年多故事时三个 story_id 各自命中
 * 自己的里程碑节点，保证 docked 状态唯一。
 */
export function selectMilestoneByStoryId(milestones, storyId) {
  if (!Array.isArray(milestones) || !storyId) return null;
  return (
    milestones.find((m) => m.story_id === storyId && m.interactive) ??
    milestones.find((m) => m.story_id === storyId) ??
    null
  );
}

/**
 * 里程碑是否可交互（有 story_id 且对应已录制故事条目）。
 */
export function milestoneInteractive(milestone) {
  return Boolean(milestone && milestone.story_id && milestone.interactive);
}

/**
 * 由 entries + rail 构建带状态的里程碑列表（从 history-atlas-app.jsx 抽出）。
 * entryByStoryId 用 story_id 索引（已是正确身份映射）。
 * active 高亮以选中 story_id 定位：`m.story_id === selectedStoryId`，
 * 同年多个节点只有被选中的那个 active（旧按年判 active 会把同年全部点亮）。
 * selectedStoryId 为字符串 story_id；向后兼容传入数字年份的旧调用。
 */
export function buildMilestones(entries, rail, selectedStoryId) {
  const entryByStoryId = new Map(
    (Array.isArray(entries) ? entries : []).map((entry) => [
      entry.story.story_id,
      entry,
    ]),
  );

  return (Array.isArray(rail) ? rail : []).map((milestone) => {
    const storyEntry = milestone.story_id ? entryByStoryId.get(milestone.story_id) : null;
    const regionId = milestoneRegionId(milestone);
    const isActive =
      typeof selectedStoryId === "string" &&
      Boolean(milestone.story_id) &&
      milestone.story_id === selectedStoryId;
    return {
      ...milestone,
      status: isActive
        ? "active"
        : storyEntry
          ? "available"
          : regionId
            ? "preview"
            : "upcoming",
      interactive: Boolean(storyEntry),
      storyYear: storyEntry?.story.timeline.year ?? null,
      regionId,
    };
  });
}
