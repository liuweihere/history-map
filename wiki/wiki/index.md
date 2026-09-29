---
type: overview
id: wiki-index
title: Wiki Index
created: 2026-05-11
updated: 2026-05-19
review_status: human_reviewed
source_refs: []
---

# Wiki Index

## Start Here

- `overview.md` — 项目定位与当前阶段
- `/Users/mialiu/repository/llm-wiki/little-star-history-wiki/schema.md` — 历史 wiki 的长期约束
- `synthesis/data-contract.md` — 导出给站点的结构化契约
- `sources/历史来源分层规范.md` — raw/source/canonical/product 的分层边界
- `sources/历史来源总表.md` — 长期来源登记
- `queries/open-questions.md` — 当前待研究问题

## Current Story Bundle

当前唯一真实录入、可导出的故事包是：`前202-项羽乌江自刎`

### Core Pages

- `entities/events/前202-项羽乌江自刎.md`
- `entities/map-layers/前202-项羽乌江自刎-地图计划.md`
- `synthesis/child-stories/前202-项羽乌江自刎-age7.md`
- `synthesis/parent-notes/前202-项羽乌江自刎-家长说明.md`

### Source Pages

- `sources/前202-项羽乌江自刎-史料提要.md`
- `sources/前202-项羽乌江自刎-史记摘录.md`
- `sources/前202-项羽乌江自刎-亲子讲述提纲.md`
- `sources/前202-项羽乌江自刎-小星星讲述.md`

### Supporting Entities

- `entities/people/项羽.md`
- `entities/people/刘邦.md`
- `entities/people/乌江亭长.md`
- `entities/factions/楚军.md`
- `entities/factions/汉军.md`
- `entities/places/垓下.md`
- `entities/places/乌江.md`
- `entities/places/江东.md`

## New Ingested Entities (周亚夫治军)

以下实体和概念已从《周亚夫治军》源文件中提取并创建：

### People
- `entities/people/汉文帝.md`
- `entities/people/周亚夫.md`
- `entities/people/汉景帝.md`

### Factions
- `entities/factions/匈奴.md`

### Places
- `entities/places/细柳.md`

### Concepts
- `concepts/严明军纪.md`
- `concepts/劳军.md`

### Sources
- `sources/周亚夫治军.md`

## Working Principle

这个 wiki 现在不追求“覆盖更多朝代”，而是优先验证一条完整链路：

`孩子口述 -> 正史校正 -> 故事包 -> 导出 JSON -> 地图站点呈现`

## Templates

- `synthesis/templates/story-bundle-checklist.md`
- `synthesis/templates/source-template.md`
- `synthesis/templates/event-template.md`
- `synthesis/templates/map-layer-template.md`
- `synthesis/templates/child-story-template.md`
- `synthesis/templates/parent-note-template.md`