# Wiki Schema

## Core Principle

本 wiki 是“历史知识生产与审核后台”，不是最终产品数据库。

知识分为三层：

1. Raw Sources
   - 原始史料、PDF、讲义、地图参考、读书笔记
2. Canonical Wiki
   - 审核后的结构化知识页
3. Product Data
   - 导出给网站的 JSON / YAML / GeoJSON

## Directory Layout

```text
raw/
  assets/
  sources/

wiki/
  entities/
    people/
    events/
    places/
    factions/
    relationships/
    map-layers/
  sources/
  synthesis/
    child-stories/
    parent-notes/
    templates/
  queries/
  index.md
  overview.md
  log.md
```

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
| person | wiki/entities/people/ | 人物 |
| event | wiki/entities/events/ | 事件 |
| place | wiki/entities/places/ | 地点 |
| faction | wiki/entities/factions/ | 势力 / 政权 |
| relationship | wiki/entities/relationships/ | 关系 |
| map_layer | wiki/entities/map-layers/ | 地图图层元数据 |
| source | wiki/sources/ | 史料来源页 |
| child_story | wiki/synthesis/child-stories/ | 儿童叙事页 |
| parent_note | wiki/synthesis/parent-notes/ | 家长说明页 |
| overview | wiki/overview.md | 全局说明 |
| query | wiki/queries/ | 待研究问题 |

## Required Frontmatter Rules

所有 canonical 页面必须包含：

```yaml
---
type: person | event | place | faction | relationship | map_layer | source | child_story | parent_note | overview | query
id: stable_machine_id
title: Human-readable title
created: YYYY-MM-DD
updated: YYYY-MM-DD
review_status: draft | ai_generated | human_reviewed | published
source_refs: []
---
```

`wiki/synthesis/templates/` 下的工作模板允许暂时不带 canonical frontmatter，因为它们是“待复制的脚手架”，不是发布对象。

## Domain Fields

推荐按需添加：

- `year`
- `start_year`
- `end_year`
- `period`
- `era`
- `factions`
- `people`
- `places`
- `events`
- `certainty: high | medium | low`
- `content_mode: 正史 | 演义 | 民间传说 | 儿童改写`
- `child_ready: true | false`
- `map_required: true | false`
- `causes`
- `effects`

## Historical Modeling Rules

### Event

每个事件尽量回答：

- 发生了什么
- 谁参与
- 结果怎样
- 为什么重要

### Person

人物不是静态标签，允许有阶段变化。

推荐增加：

- `faction_memberships`
- `roles`
- `keywords`

### Relationship

关系尽量带时间范围：

- `start_year`
- `end_year`

必要时注明关系的上下文事件。

### Map Layer

古代势力边界不是现代行政边界，必须允许：

- `certainty`
- “教学示意图”说明
- `display_type`

## Writing Rules

- 正史、演义、传说必须区分
- 儿童叙事与史实摘要必须分离
- 可以使用 `[[wikilink]]` 组织知识网络
- 未审核内容不得视为可发布内容
- 站点导出只读取 `review_status: published` 的内容

## MVP Focus

第一阶段只做：

- 东汉末年到三国形成篇
- 时间范围：184—229
- 8 个关键节点
- 12 个核心人物
- 主要势力、地点、事件、关系、地图图层
