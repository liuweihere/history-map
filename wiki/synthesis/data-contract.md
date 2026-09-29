---
type: parent_note
id: product_data_contract
title: Product Data Contract
created: 2026-05-11
updated: 2026-05-19
review_status: human_reviewed
source_refs: []
---

# Product Data Contract

## Principle

前端网站不解析任意 markdown，而是只读取导出的结构化故事包。

当前导出层以“一个故事包 = 一个 event json + 一个 story json”为准。

## Export Targets

- `event_<event-id>.json`
- `story-<story-slug>.json`
- `timeline-rail.json`

## Event JSON

事件导出负责稳定史实信息，当前最小字段集：

- `id`
- `title`
- `year`
- `period`
- `era`
- `type`
- `review_status`
- `source_refs`
- `people`
- `factions`
- `places`
- `causes`
- `effects`
- `result`
- `importance`
- `child_summary`
- `questions`

## Story JSON

故事导出负责页面编排与地图叙事，当前最小字段集：

- `story_id`
- `review_status`
- `timeline.year`
- `timeline.label`
- `timeline.lesson`
- `event.id`
- `event.title`
- `event.type`
- `event.year`
- `event.result`
- `event.importance`
- `sources.page_ids`
- `sources.raw_files`
- `sources.bibliography`
- `people[]`
- `factions[]`
- `places[]`
- `child_story.id`
- `child_story.title`
- `panel.child_spotlight`
- `panel.year_tags[]`
- `panel.map_focus[]`
- `panel.reading_keys[]`
- `panel.memory_anchors[]`
- `panel.parent_prompt[]`
- `scene.deck`
- `scene.map_headline`
- `scene.map_headline_en`
- `scene.meta_label`
- `scene.caption`
- `scene.annotations[]`
- `scene.legend[]`
- `map_plan.id`
- `map_plan.display_type`
- `map_plan.certainty`

## Timeline Rail JSON

时间轴导出负责“历史骨架先出现，故事逐步点亮”的体验，字段包括：

- `milestones[].year`
- `milestones[].period`
- `milestones[].label`
- `milestones[].note`
- `milestones[].lesson`
- `milestones[].story_id`
- `milestones[].story_status`

## Panel Field Ownership

这些字段必须从 wiki 内容层抽取，不允许在前端长期手写：

- `panel.child_spotlight` <- 地图计划页 `先看地图`
- `panel.year_tags` <- 地图计划页 `年度标签`
- `panel.map_focus` <- 地图计划页 `地图阅读步骤`
- `panel.reading_keys` <- 地图计划页 `阅读抓手`
- `panel.memory_anchors` <- 地图计划页 `记忆锚点`
- `panel.parent_prompt` <- 家长说明页 `适合追问孩子的问题`
- `scene.deck` <- 地图计划页 `页首导语`
- `scene.map_headline` <- 地图计划页 `地图标题`
- `scene.map_headline_en` <- 地图计划页 `地图标题英文`
- `scene.meta_label` <- 地图计划页 `焦点标签`
- `scene.annotations` <- 地图计划页 `地图注记`
- `scene.legend` <- 地图计划页 `图例`
- `scene.caption` <- 地图计划页 `地图注脚`

## Traceability Rule

每个导出字段都必须能反查到 canonical 页面和 raw source：

- event / story 中的事实性内容，能追到 source page
- source page 中的断言，能追到 raw source
- 站点看到的解释文案，能追到 event / map-layer / parent-note

## Publication Rule

只有通过以下检查的故事包才能导出：

1. 故事包的必需页面齐全
2. event、map_layer、child_story、parent_note 结构完整
3. 至少有一份正史支撑和一份亲子输入支撑
4. `review_status` 已达到可导出的状态

## Frontend Rule

前端可以拥有少量视觉配置，但不应拥有核心叙事配置。

允许前端控制的内容：

- 版式
- 色彩
- 地图图层样式
- 视觉注释坐标

不应由前端独立决定的内容：

- 这一年孩子要理解什么
- 先看地图哪里
- 阅读抓手是什么
- 要追问孩子什么
- 哪些词是记忆锚点
- 页首导语和地图标题是什么
- 时间轴上有哪些历史节点先被占位显示
