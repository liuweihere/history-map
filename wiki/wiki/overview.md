---
type: overview
id: overview_little_star_history
title: Little Star History Wiki Overview
created: 2026-05-11
updated: 2026-05-21
review_status: human_reviewed
source_refs: []
---

# Overview

这是“小星星历史地图馆”的内容生产后台。

它负责的不是直接给孩子看网页，而是把孩子的口述、家长的讲述和正史材料组织成可导出的故事包。

## What This Wiki Does

- 保存原始口述和讲述记录
- 维护正史校正后的 canonical source
- 建立事件、人物、地点、势力、地图计划
- 形成儿童版叙事和家长说明
- 导出站点可读取的 JSON

## What This Wiki Is Not

- 不是百科式越多越好的历史仓库
- 不是未经审核的 AI 生成历史集合
- 不是前端页面的备用文案仓

## Current Phase

当前阶段不是泛泛 ingest 更多页面，而是把“录入一个故事”稳定约束成完整 story bundle 链路：

`视频/录音 -> 转写 -> raw source -> canonical source -> story bundle -> export -> site`

现在唯一真实完成的故事是：`前202-项羽乌江自刎`

最新录入的《周亚夫治军》是当前最重要的系统测试样本：它已经完成 source ingest 和实体抽取，但仍未形成完整 story bundle。这个样本明确暴露出系统边界，也正用来推动 LLM 从“会 ingest source”升级到“会完成 story bundle”。

## Canonical Workflow

1. 把输入放入 `raw/sources/`
2. 在 `wiki/sources/` 形成可引用、可校对的来源页
3. 建立或更新必要的事件 / 人物 / 地点 / 势力页
4. 补齐地图计划、儿童故事、家长说明
5. 跑导出脚本，进入 `06_Exports/json`
6. 同步到站点并验证页面呈现

## LLM Completion Rule

LLM 在本项目中默认不能把“已 ingest source / 已抽实体 / 已补时间线”视为完成。

只有当一个故事完成：

- story bundle 四件套
- 导出器注册
- 导出 JSON
- 站点同步

之后，才算真正进入系统。

## Current Quality Bar

一个故事包只有在下面几件事都成立时，才算“真的录入成功”：

- 能反查 raw 输入
- 能反查正史支点
- 儿童讲述和家长讲法分层清楚
- 地图阅读步骤能落到导出 JSON
- 站点右侧解释面板能由内容层驱动
