# Little Star History Wiki

This repository is the content workspace for the Little Star History project.

It is the source-of-truth repo for:

- raw historical inputs
- canonical source pages
- story-bundle pages
- child-facing stories
- parent notes
- map plans
- structured export data for the frontend site

## Current Scope

The current goal is not broad historical coverage. It is to make one real story bundle work end to end.

Current canonical story bundle:

- `前202 项羽乌江自刎`

## Repository Role

Think of this repo as a knowledge compiler workspace.

- `raw/` stores recordings, digests, excerpts, and teaching notes
- `wiki/sources/` stores normalized source pages
- `wiki/entities/` stores canonical events, people, places, factions, and map layers
- `wiki/synthesis/` stores child stories, parent notes, curriculum views, and templates
- `scripts/export-history-data.ts` compiles story bundles into product JSON
- `06_Exports/json/` stores generated frontend-ready JSON

## Workflow

1. Add or revise raw sources in `raw/sources/`
2. Normalize them into `wiki/sources/`
3. Build a complete story bundle in `wiki/entities/` and `wiki/synthesis/`
4. Export runtime JSON for the site

## Standard Operating Procedure

后续新增真实历史故事，都按这一套来。不要跳步骤。

### Target Example

如果现在要录入的新故事是 `周亚夫治军`，先把它当成一个完整 `story bundle` 来做，而不是只改时间线里的一个节点。

推荐先定下这几个基础字段：

- 年份：先定一个主年份，例如 `-154`
- 时代：例如 `西汉`
- 标题：`周亚夫治军`
- 文件名前缀：`前154-周亚夫治军`
- story id：`story_001_zhou_yafu_zhijun`
- event id：`event_zhou_yafu_zhijun_154_bce`

命名一旦定了，后面所有文件都跟着这套走，不要中途换叫法。

### Step 1: 先补时间线占位

先在 [`wiki/synthesis/curriculum/小星星历史时间线.md`](./wiki/synthesis/curriculum/小星星历史时间线.md) 里加一行：

- 把事件名写成孩子会记住的故事名
- `故事状态` 先写 `planned`
- `story_id` 先留空

只有当完整故事包完成后，才把这一行改成：

- `故事状态 = recorded`
- `story_id = 你的 story id`

### Step 2: 准备 raw 输入

至少准备 3 类原始材料，放到 `raw/sources/` 下：

- `raw/sources/historical-digests/前154-周亚夫治军-史料提要.md`
- `raw/sources/teaching-notes/前154-周亚夫治军-亲子讲述提纲.md`
- `raw/sources/kids-narration/前154-周亚夫治军-小星星讲述.md`

如果需要原典支撑，再补：

- `raw/sources/classical-texts/前154-周亚夫治军-史记或汉书摘录.md`

这一步的目标不是写漂亮，而是把“史实骨架、讲述路径、孩子真实反馈”先攒齐。

### Step 3: 建 canonical source 页面

raw 文件准备好后，在 `wiki/sources/` 下为每份原始材料建立对应页面：

- `wiki/sources/前154-周亚夫治军-史料提要.md`
- `wiki/sources/前154-周亚夫治军-亲子讲述提纲.md`
- `wiki/sources/前154-周亚夫治军-小星星讲述.md`
- 如果有原典，再加 `wiki/sources/前154-周亚夫治军-史记摘录.md`

每个 source 页面都要写清楚：

- `type: source`
- 唯一 `id`
- 它对应哪个 raw 文件
- 它支撑了哪些事件判断
- 它是“正史改写”“儿童反馈”还是“讲述提纲”

### Step 4: 建 4 个 story-bundle 主页面

这是最核心的一步。一个能进网页的真实故事，至少要有这 4 个页面：

- event 页：`wiki/entities/events/前154-周亚夫治军.md`
- map-layer 页：`wiki/entities/map-layers/前154-周亚夫治军-地图计划.md`
- child-story 页：`wiki/synthesis/child-stories/前154-周亚夫治军-age7.md`
- parent-note 页：`wiki/synthesis/parent-notes/前154-周亚夫治军-家长说明.md`

可以直接参考现有这一套：

- [`前202-项羽乌江自刎.md`](./wiki/entities/events/前202-项羽乌江自刎.md)
- [`前202-项羽乌江自刎-age7.md`](./wiki/synthesis/child-stories/前202-项羽乌江自刎-age7.md)

这 4 个页面分别承担的职责：

- `event`：历史事实骨架、因果、意义、人物地点势力引用
- `map-layer`：地图怎么讲、先看哪里、图例和阅读抓手
- `child-story`：真正给孩子读的短故事
- `parent-note`：家长怎么追问、怎么解释、怎么纠偏

### Step 5: 补必要实体

如果 `周亚夫治军` 会引用到新人物、新地点、新势力，就补 canonical 实体页：

- 人物放 `wiki/entities/people/`
- 地点放 `wiki/entities/places/`
- 势力放 `wiki/entities/factions/`

原则是只补“故事真正会用到”的实体，不要为了完整而泛滥建页。

### Step 6: 注册到导出器

这是最容易漏的一步。

即使你前面的 Markdown 全写完了，如果不把新故事注册进导出脚本，网页也不会出现它。

去修改 [`scripts/export-history-data.ts`](./scripts/export-history-data.ts) 里的 `STORY_CONFIGS`，新增一项，至少补齐这些字段：

- `storyId`
- `eventFile`
- `childStoryFile`
- `parentNoteFile`
- `mapLayerFile`
- `sourcePageFiles`
- `requiredMapSourceIds`
- `outputEventFile`
- `outputStoryFile`

`周亚夫治军` 的注册项建议按现有格式新增一条，放在 `项羽乌江自刎` 后面，编号递增，比如：

- `storyId: "story_001_zhou_yafu_zhijun"`
- `outputStoryFile: "story-001-zhou-yafu-zhijun.json"`

### Step 7: 点亮时间线

当且仅当下面两件事都完成后，再回到时间线把节点点亮：

1. story bundle 四件套已经写完
2. 导出器已经注册完成

这时把时间线那一行改成：

- `故事状态 = recorded`
- `story_id = story_001_zhou_yafu_zhijun`

### Step 8: 运行导出和站点同步

先在本仓库运行：

```bash
cd /Users/mialiu/repository/llm-wiki/little-star-history-wiki
npm run export:history
```

再去站点仓库运行：

```bash
cd /Users/mialiu/repository/llm-wiki/little-star-history-site
npm run sync:data
```

如果要确认网页没坏，再跑：

```bash
npm run build
```

### Step 9: 验收标准

只有下面都成立，才算这个故事真正录入完成：

- 时间线里能看到这个节点
- `story_status` 已经是 `recorded`
- `story_id` 已经连到真实故事
- `06_Exports/json/` 里出现新的 `event_*.json` 和 `story-*.json`
- `little-star-history-site/public/data/generated/` 里也有同步后的 JSON
- 网页上能读到新内容，而不是旧的静态文案

## Minimal Deliverables For One New Story

以后每次新增一个真实故事，最少要交付这些文件：

- 3 到 4 个 raw 文件
- 3 到 4 个 `wiki/sources/` 文件
- 1 个 `event`
- 1 个 `map-layer`
- 1 个 `child-story`
- 1 个 `parent-note`
- 必要时若干人物 / 地点 / 势力页
- 1 条时间线更新
- 1 条 `STORY_CONFIGS` 注册项

## Recommended Order For 周亚夫治军

如果下一步就做 `周亚夫治军`，建议严格按这个顺序：

1. 先补 `raw/sources/historical-digests/前154-周亚夫治军-史料提要.md`
2. 再补 `raw/sources/teaching-notes/前154-周亚夫治军-亲子讲述提纲.md`
3. 再补 `raw/sources/kids-narration/前154-周亚夫治军-小星星讲述.md`
4. 把这 3 份材料转成 `wiki/sources/` 页面
5. 建 `event` 页
6. 建 `map-layer` 页
7. 建 `child-story` 页
8. 建 `parent-note` 页
9. 补必要实体
10. 注册 `STORY_CONFIGS`
11. 把时间线从 `planned` 点亮到 `recorded`
12. 跑 `export:history` 和 `sync:data`

## Commands

```bash
npm run export:history
```

## Related Repository

The frontend runtime lives in the sibling repository:

- `little-star-history-site`
