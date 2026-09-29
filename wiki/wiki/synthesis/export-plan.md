---
type: parent_note
id: export_pipeline_plan
title: Export Pipeline Plan
created: 2026-05-11
updated: 2026-05-11
review_status: human_reviewed
source_refs: []
---

# Export Pipeline Plan

## Objective

把 wiki 当作“源代码目录”，再编译成前端可直接消费的数据包。

## Proposed Pipeline

1. 读取 `wiki/entities/**` 与 `wiki/synthesis/**`
2. 解析 frontmatter
3. 校验必填字段
4. 过滤未发布内容
5. 组装为产品导出 JSON
6. 复制或生成对应 GeoJSON 清单

## Suggested Output Location

```text
06_Exports/
  json/
  yaml/
  geojson/
```

或在未来前端仓库中生成：

```text
public/data/
```

## Validation Rules

- `id` 必须唯一
- 事件必须有 `year`
- 关系尽量带 `start_year` / `end_year`
- 地图图层必须声明 `certainty`
- 人物、事件、地点之间的引用必须可解析

## Near-Term Script

建议未来写一个脚本：

`scripts/export-history-data.ts`

职责：

- 读取 Markdown
- 解析 YAML frontmatter
- 生成结构化 JSON
- 输出校验报告
