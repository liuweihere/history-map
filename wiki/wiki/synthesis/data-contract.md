---
type: parent_note
id: product_data_contract
title: Product Data Contract
created: 2026-05-11
updated: 2026-05-11
review_status: human_reviewed
source_refs: []
---

# Product Data Contract

## Principle

前端网站不直接解析任意 wiki 页面，而是只读取导出的结构化数据。

## Canonical Export Targets

- `events.json`
- `people.json`
- `places.json`
- `factions.json`
- `relationships.json`
- `timeline.json`
- `map-layers.json`
- `maps/<year>/*.geojson`

## Minimum Shared Fields

所有导出对象至少具备：

- `id`
- `title` 或 `name`
- `review_status`
- `source_refs`

## Event Contract

推荐字段：

- `id`
- `title`
- `year`
- `type`
- `period`
- `place_id`
- `people`
- `factions`
- `result`
- `importance`
- `child_summary`
- `parent_note`
- `questions`
- `causes`
- `effects`
- `source_refs`

## Person Contract

推荐字段：

- `id`
- `name`
- `birth_year`
- `death_year`
- `roles`
- `keywords`
- `factions`
- `events`
- `child_summary`
- `relationships`
- `source_refs`

## Map Contract

地图相关对象至少具备：

- `id`
- `year`
- `display_type`
- `certainty`
- `geojson_file`
- `faction_id` 或 `place_id`

## Publication Rule

只有 `review_status: published` 的页面可以进入网站导出。
