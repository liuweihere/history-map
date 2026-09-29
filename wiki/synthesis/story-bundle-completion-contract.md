---
type: parent_note
id: story_bundle_completion_contract
title: Story Bundle Completion Contract
created: 2026-05-21
updated: 2026-05-21
review_status: draft
source_refs: []
content_mode: 正史改写
---

# Story Bundle Completion Contract

这份文件不是内容页，而是给 LLM 的完成定义。

在 `little-star-history-wiki` 中，用户说“录入一个历史故事”“把一个故事做进系统”，默认不是完成 source ingest，而是完成 story bundle ingest。

## Default Interpretation

除非用户明确说“只占位”“只抽实体”“只写草稿”“先不导出”，否则 LLM 必须把任务理解为：

> 把这个故事接入为一个完整、可导出、可同步到站点的 story bundle。

## Minimum Completion

一个新故事只有在下面都成立时，才算完成：

- 时间线中有这个节点
- raw source 已存在且可反查
- `wiki/sources/` 中有对应 canonical source 页
- `event` 页存在
- `map-layer` 页存在
- `child-story` 页存在
- `parent-note` 页存在
- 必要人物 / 地点 / 势力实体已存在
- `scripts/export-history-data.ts` 的 `STORY_CONFIGS` 已注册该故事
- `06_Exports/json/` 中生成了新的 event / story JSON
- 站点侧 `public/data/generated/` 已同步到新 JSON

## Recorded Gate

LLM 只有在完整 story bundle 已满足最小完成条件后，才能把时间线节点从 `planned` 改成 `recorded`。

如果下列任一项缺失，必须保持：

- `story_status = planned`
- `story_id` 为空，或暂不宣称可点击

## What LLM Must Not Do

LLM 不得把以下状态误报为“完成”：

- 只新增了时间线
- 只 ingest 了 raw source
- 只生成了 `wiki/sources/`
- 只创建了实体和概念页
- 只写了 story bundle 四件套但没注册导出器
- 只跑了导出但没同步到站点

## Required Final Status Language

当故事尚未完成时，LLM 必须明确报告停留层级，而不是笼统说“已录入”。

允许的状态表达包括：

- 仅完成时间线占位
- 仅完成 source ingest
- 已完成实体抽取，但 story bundle 未完成
- 已完成 story bundle 页面，但未注册导出器
- 已完成导出，但站点未同步

## Example: 周亚夫治军

`周亚夫治军` 当前是一个典型的“source ingest 已完成、story bundle ingest 未完成”的样本。

它已经有：

- raw kids narration
- canonical source page
- 多个实体 / 概念页
- 时间线占位

但它还缺：

- event
- map-layer
- child-story
- parent-note
- `STORY_CONFIGS` 注册
- 可点击 story export

因此它当前正确状态只能是：

- `planned`
- 未完成完整 story bundle
