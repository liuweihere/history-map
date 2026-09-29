# Little Star History Wiki Schema

## Positioning

`github_llm_wiki` 是通用引擎，`little-star-history-wiki` 是它下面的历史领域实现。

这个仓库不是“随手记历史”的笔记本，而是一个有明确产出的内容系统：

1. 接住原始输入
2. 校正史实
3. 组织亲子叙事
4. 导出地图站点可消费的数据

## Core Unit: Story Bundle

本项目的第一公民不是单独的人物页或概念页，而是一个 `story bundle`。

一个故事只有满足下面的最小闭环，才算真正进入系统：

- 1 份正史或编年来源
- 1 份亲子讲述记录
- 1 份孩子口述或反馈
- 1 个事件页
- 1 个地图计划页
- 1 个儿童故事页
- 1 个家长说明页
- 1 组导出 JSON

当前唯一真实故事包是：`前202-项羽乌江自刎`

## LLM Operating Constraint

LLM 在本项目中不是“给建议的人”，而是实际维护 wiki 结构和内容的人。

因此，当用户说“录入一个历史故事”“新增一个节点”“把某个故事做进系统”时，LLM 默认不能只做下面这些局部动作：

- 只改时间线
- 只写一页 event
- 只补一个 child story
- 只给操作建议但不更新系统文件

LLM 必须把任务理解为：把这个故事作为一个 `story bundle` 接入系统。

除非用户明确要求“只占位”“只写草稿”“先不导出”，否则默认目标是完成到可导出、可被站点消费的程度。

## Directory Layout

```text
raw/
  sources/
    classical-texts/
    historical-digests/
    kids-narration/
    teaching-notes/
    source-registry/

wiki/
  concepts/
  entities/
    events/
    factions/
    map-layers/
    people/
    places/
  sources/
  synthesis/
    child-stories/
    curriculum/
    parent-notes/
    templates/
  queries/
  index.md
  log.md
  overview.md

06_Exports/
  json/
```

## Source Layers

### Layer 1: Raw Sources

原始输入保留在 `raw/sources/`，不追求格式统一，但必须保真。

常见类型：

- `classical-texts/`：原典摘录
- `historical-digests/`：史料提要
- `teaching-notes/`：家长讲述提纲
- `kids-narration/`：孩子口述、复述、反馈

### Layer 2: Canonical Sources

`wiki/sources/` 是导出器真正读取的上游。每一页都必须回答：

- 这份来源属于什么类型
- 它支撑哪个故事包
- 它能稳定支持哪些断言
- 哪些地方仍需核查

### Layer 3: Story Bundle Pages

`wiki/entities/` 和 `wiki/synthesis/` 中的页面承担正式建模职责。

### Layer 4: Product Data

站点不直接解析 wiki 页面，只消费 `06_Exports/json/` 下的结构化导出。

## Required Canonical Page Types

### Event

事件页负责史实骨架，必须包含：

- 事件经过
- 历史意义
- 儿童讲述
- 儿童理解要点
- 亲子问题
- 地图说明
- 正史 / 文学 / 传说边界

### Map Layer

地图计划页负责地图叙事，必须包含：

- 地图目标
- 页首导语
- 地图标题
- 地图标题英文
- 焦点标签
- 显示元素
- 不显示
- 儿童提示语
- 地图注记
- 图例
- 年度标签
- 先看地图
- 阅读抓手
- 地图阅读步骤
- 记忆锚点
- 地图注脚

### Child Story

儿童故事页负责讲给孩子听的叙事正文，不承担史实争议说明。

### Parent Note

家长说明页负责教学意图和追问路径，必须包含：

- 本节学习目标
- 建议讲法
- 正史支点
- 正史 / 文学区分
- 地图提示
- 适合追问孩子的问题

## Entity Creation Threshold

不是所有提到的人物、地点、势力都要建 canonical entity。

只有满足以下条件之一才建议建页：

- 会跨两个以上故事复用
- 是当前故事的关键理解节点
- 会被地图或导出字段直接引用

否则优先留在事件页或来源页中，不要制造噪音实体。

## Naming Rules

- 页面文件名优先使用中文直观命名
- 事件文件名格式：`年份-事件名.md`
- 儿童故事文件名格式：`年份-事件名-age7.md`
- 家长说明文件名格式：`年份-事件名-家长说明.md`
- 地图计划文件名格式：`年份-事件名-地图计划.md`
- source 页与 raw 页保持可追踪的一一映射

## Frontmatter Rules

所有 canonical 页面都必须具备：

```yaml
---
type:
id:
title:
created:
updated:
review_status: draft | ai_generated | human_reviewed | published
source_refs: []
---
```

故事包相关页面还必须补齐自己的领域字段，例如：

- event: `year`, `period`, `people`, `places`, `factions`, `sources`
- map_layer: `event`, `display_type`, `certainty`, `geojson_file`
- child_story: `event`, `age_level`
- parent_note: `event`
- source: `content_mode`, `sources`

## Publication Gates

以下任一条件不满足，都不能进入导出层：

1. 来源层不完整
2. 故事包页面不完整
3. frontmatter 缺关键字段
4. `source_refs` 和 `sources` 不能反查
5. 页面仍停留在调试草稿且未做人工复核

## Story Ingest Workflow

后续 LLM 录入任何一个新历史故事，都必须遵循这套顺序，不能跳步。

执行时，LLM 还应同时参考：

- `wiki/synthesis/templates/story-bundle-checklist.md`
- `wiki/synthesis/story-bundle-completion-contract.md`

### 1. 先建时间线占位

先在 `wiki/synthesis/curriculum/小星星历史时间线.md` 中新增一行。

默认规则：

- 事件名优先写孩子能记住的故事名
- `故事状态` 先写 `planned`
- `story_id` 先留空

如果完整故事包尚未完成，LLM 不得提前把该节点点亮成 `recorded`。

### 2. 补 raw source

每个真实故事默认至少准备以下 3 类 raw 输入：

- `raw/sources/historical-digests/`
- `raw/sources/teaching-notes/`
- `raw/sources/kids-narration/`

如需正史支撑，再补：

- `raw/sources/classical-texts/`

如果缺少 raw source，LLM 不应假装故事已经“完整录入”，最多只能做 `planned` 占位。

### 3. 补 canonical source 页

每份 raw 输入都必须有对应的 `wiki/sources/` 页面。

`wiki/sources/` 页面必须能回答：

- 来源类型是什么
- 它支撑哪个故事包
- 它对应哪个 raw 文件
- 它能稳定支持哪些断言

### 4. 补 4 个 story-bundle 主页面

一个新故事默认至少要有：

- 1 个 `event`
- 1 个 `map-layer`
- 1 个 `child-story`
- 1 个 `parent-note`

缺其中任意一个，都不能算完整 story bundle。

### 5. 只补必要实体

如果事件页或地图页引用了新人物、地点、势力，LLM 只补必要实体页，不得为了“看起来完整”过度扩写无关实体。

### 6. 注册导出器

这一步是硬约束。

如果一个故事已经写完 story bundle 页面，LLM 还必须同步修改 `scripts/export-history-data.ts` 中的 `STORY_CONFIGS`。

否则这个故事不会进入 `06_Exports/json/`，站点也不会显示它。

因此：

- 写完故事页但不注册导出器，任务不算完成
- 只更新时间线但不注册导出器，任务不算完成
- 只生成 JSON 草稿但不把页面接回 wiki，任务也不算完成

### 7. 完整后再点亮 `recorded`

只有当以下条件同时满足时，LLM 才能把时间线节点从 `planned` 改成 `recorded`：

1. raw source 已补齐到可用程度
2. canonical source 页已建立
3. event / map-layer / child-story / parent-note 已完成
4. `STORY_CONFIGS` 已注册
5. 导出脚本可成功运行

### 8. 导出与同步

LLM 完成新故事录入后，默认还必须执行：

1. `npm run export:history`
2. 在站点仓库执行 `npm run sync:data`

如有条件，最好再执行一次站点 `build` 或等价验证。

如果只改 markdown、不跑导出同步，不能向用户声称“网页已经更新”。

## Completion Definition For New Stories

当用户要求“录入一个新历史故事”时，LLM 只有在下列结果都成立时才算完成：

- 时间线里存在该节点
- raw source 已建立
- `wiki/sources/` 已建立
- story bundle 四件套已建立
- 必要实体已存在
- 导出器已注册
- `06_Exports/json/` 中出现新的 event/story 导出文件
- 站点侧 `public/data/generated/` 已同步

这个完成定义的正式说明见：

- `wiki/synthesis/story-bundle-completion-contract.md`

否则，LLM 应明确说明当前只完成到了哪一层：

- 仅时间线占位
- 仅 source 层
- 仅 story bundle 草稿
- 已完成导出但尚未同步到站点

## Product-Driven Constraint

任何要出现在站点右侧解释面板的内容，都必须在 wiki 层有明确归宿，不允许长期依赖前端硬编码。

当前归宿约定：

- `event.儿童讲述` -> `event.child_summary`
- `map-layer.页首导语` -> `story.scene.deck`
- `map-layer.地图标题` -> `story.scene.map_headline`
- `map-layer.地图标题英文` -> `story.scene.map_headline_en`
- `map-layer.焦点标签` -> `story.scene.meta_label`
- `map-layer.地图注记` -> `story.scene.annotations`
- `map-layer.图例` -> `story.scene.legend`
- `map-layer.地图注脚` -> `story.scene.caption`
- `map-layer.先看地图` -> `story.panel.child_spotlight`
- `map-layer.年度标签` -> `story.panel.year_tags`
- `map-layer.地图阅读步骤` -> `story.panel.map_focus`
- `map-layer.阅读抓手` -> `story.panel.reading_keys`
- `map-layer.记忆锚点` -> `story.panel.memory_anchors`
- `parent-note.适合追问孩子的问题` -> `story.panel.parent_prompt`

时间轴也遵循同样规则：

- `wiki/synthesis/curriculum/小星星历史时间线.md` -> `timeline-rail.json`
- 没有故事包的节点可以先作为 `planned milestone` 出现
- 有故事包的节点再通过 `story_id` 与实际故事联动

## Current Phase

当前阶段先做稳一条真实故事包，不追求大规模覆盖。

判断标准不是“页数多”，而是：

- 口述可进入系统
- 正史可校正口述
- 地图叙事可从 wiki 导出
- 站点能准确反映当前内容
