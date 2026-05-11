---
type: overview
id: overview_little_star_history
title: Little Star History Wiki Overview
created: 2026-05-11
updated: 2026-05-11
review_status: human_reviewed
source_refs: []
---

# Overview

这是“小星星历史地图馆”的知识生产后台。

它不直接服务最终儿童网站，而是负责：

- 结构化整理史料
- 维护人物、事件、地点、势力、关系、地图图层
- 区分正史、演义、传说和儿童改写
- 为后续前端导出稳定的 JSON / YAML / GeoJSON

## Current Objective

第一阶段聚焦《三国形成篇》MVP，时间范围为 `184—229`。

要先做稳的不是页面炫技，而是底层知识结构：

- 时间节点
- 地点与地图图层
- 人物与势力
- 事件因果
- 儿童版与家长版叙事分层

## Canonical Workflow

1. 把原始资料放进 `raw/sources/`
2. 在 `wiki/sources/` 中形成来源页或读书页
3. 抽取 canonical entities
4. 形成人工审核后的事件、人物、地点、势力、关系页
5. 再导出到产品数据层

## This Wiki Is Not

- 不是最终产品数据库
- 不是未经审核的 AI 历史生成器
- 不是直接给孩子浏览的前台网站
