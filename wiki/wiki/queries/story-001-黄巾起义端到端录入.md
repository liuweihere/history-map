---
type: query
id: story_001_yellow_turban_e2e
title: Story 001 黄巾起义端到端录入
created: 2026-05-11
updated: 2026-05-11
review_status: draft
source_refs: []
---

# Story 001: 黄巾起义端到端录入

## Goal

跑通从亲子共读记录到网站可渲染数据的完整链路。

## Scope

- reading note
- event entity
- person: 张角
- faction: 东汉、黄巾军
- place: 洛阳、钜鹿
- child story
- parent note
- timeline entry
- map plan
- export JSON draft

## Non-goals

- 不做精确黄巾军边界
- 不补全东汉全部制度
- 不写复杂战役细节

## Acceptance Criteria

- 黄巾起义可以出现在 timeline
- 事件卡可以用 age7 语言展示
- 地图计划明确
- 相关实体可以互相跳转
- 有一份导出 JSON 草案可供前端消费
