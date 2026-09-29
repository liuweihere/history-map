# Story Bundle Checklist

这张清单主要给 LLM 使用。

当用户要求“录入一个真实历史故事”时，LLM 在声称任务完成之前，必须逐项核对。

如果任何一项未完成，LLM 不应把该故事标记为完整接入。

## Raw Inputs

- [ ] `raw/sources/historical-digests/` 下有史料提要
- [ ] `raw/sources/teaching-notes/` 下有亲子讲述提纲
- [ ] `raw/sources/kids-narration/` 下有孩子口述或反馈
- [ ] 如果需要，`raw/sources/classical-texts/` 下有原典摘录

## Canonical Sources

- [ ] 每份 raw 输入都有对应 `wiki/sources/` 页面
- [ ] source 页写清楚来源类型、支撑对象、关键断言
- [ ] source 页能反查 raw 文件

## Story Bundle Pages

- [ ] event 页完成
- [ ] map-layer 页完成
- [ ] child-story 页完成
- [ ] parent-note 页完成

## Entities

- [ ] 只为必要人物 / 地点 / 势力建 canonical 页
- [ ] 被 event 或 map-layer 引用的实体都存在

## Export Readiness

- [ ] `source_refs` 完整
- [ ] `sources` 路径完整
- [ ] map-layer 的 `年度标签 / 先看地图 / 阅读抓手 / 地图阅读步骤 / 记忆锚点` 已写
- [ ] parent-note 的 `适合追问孩子的问题` 已写
- [ ] 时间线页新增一行
- [ ] `scripts/export-history-data.ts` 中 `STORY_CONFIGS` 已注册该故事
- [ ] 时间线在完整接入前保持 `planned`
- [ ] 时间线只有在 story bundle 完整后才改成 `recorded`

## Final Verification

- [ ] `npm run export:history` 成功
- [ ] `npm run sync:data` 成功
- [ ] `06_Exports/json/` 中出现该故事对应的 event/story JSON
- [ ] `little-star-history-site/public/data/generated/` 中出现同步后的 JSON
- [ ] 站点右侧解释面板显示的是新内容，而不是前端旧文案
- [ ] LLM 的最终结论明确说明：这是完整 story bundle，还是只完成到某一层
