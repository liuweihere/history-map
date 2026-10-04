# Little Star History Wiki

This directory is the content workspace (knowledge source) of the Little Star History project, inside the `history-map` monorepo (`wiki/` + `site/`).

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
- story id：`story_005_zhou_yafu_zhijun`
- event id：`event_zhou_yafu_zhijun_154_bce`

编号规则：story 编号从 `story_000` 开始递增，`story_000`–`story_004` 已被占用（项羽乌江自刎 / 蔡伦造纸 / 汉明帝求法 / 张仲景 / 煮酒论英雄），新故事永远取当前最大编号 +1，本文示例用 `story_005`。

命名一旦定了，后面所有文件都跟着这套走，不要中途换叫法。

### Step 1: 先补时间线占位

录入前先检查时间线里是否已有该故事的 `planned` 占位行；有则复用这一行（录入完成后点亮它），没有才新增占位行，不要加出重复行。

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
- `map-layer`：地图怎么讲、先看哪里、图例和阅读抓手，以及地图场景数据（bounds、标记、几何）
- `child-story`：真正给孩子读的短故事
- `parent-note`：家长怎么追问、怎么解释、怎么纠偏

#### map-layer 页必备小节清单

map-layer 页必须包含以下全部小节，缺一个 exporter 都会报错：

原有内容小节：`地图目标`、`页首导语`、`地图标题`、`地图标题英文`、`焦点标签`、`年度标签`、`先看地图`、`阅读抓手`、`地图阅读步骤`、`记忆锚点`、`讲述脉络`、`地图注脚`、`图例`、`地图注记`、`显示元素`、`不显示`、`儿童提示语`

其中`讲述脉络`的格式是硬要求：6-8 行，每行「四字标签｜一句话」，用全角`｜`分隔（exporter 用 `extractKeyValueItems` 解析，写成纯文本会失败），按孩子复述顺序排列（开头困境 → 高潮 → 收尾 → 成语点题）。

数据小节（新增，AI agent 录入新故事时**必须生成地图与场景数据**，site 前端不存任何故事内容，地图全靠这里导出）：

- `场景标记`：每个地图标记一行，格式 `place_id｜副标题｜marker kind`，kind 只能是 `capital`（主要落点）或 `uprising`（次要/起源点）。place_id 必须出现在 event 页的 `places` 列表里
- `场景几何`：内嵌 ```json 代码块，存 GeoJSON FeatureCollection，features 带 `properties.kind`（`heartland` 大区域底色 / `disturbance` 扰动区 / `route` 路线）和英文 `title`，geometry 用 Polygon 或 LineString/MultiLineString

尺度参考：`heartland` 覆盖势力主体区域（约 300-800 km 量级）；`disturbance` 聚焦故事发生的走廊/区域（约 100-300 km）；`route` 是起终点折线（3-6 个顶点，可微弯）。同一势力同期复用同一 `heartland`，保持系列地图视觉一致。

示例（摘自前202 项羽乌江自刎地图计划）：

```markdown
## 场景标记

- place_gaixia｜被围困之地｜uprising
- place_wujiang｜最后选择点｜capital

## 场景几何

\`\`\`json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "id": "story-heartland", "kind": "heartland", "title": "Chu Han Contest Zone" },
      "geometry": { "type": "Polygon", "coordinates": [[[107.4, 36.2], ...same first point...]] }
    },
    {
      "type": "Feature",
      "properties": { "id": "story-route", "kind": "route", "title": "Gaixia To Wujiang Retreat" },
      "geometry": { "type": "LineString", "coordinates": [[117.354, 33.008], [118.497, 31.727]] }
    }
  ]
}
\`\`\`
```

frontmatter 还需要：

- `map_bounds: [78.0, 15.5, 132.0, 44.5]`：数字数组 `[west, south, east, north]`，缺省时 exporter 用中国全景默认值
- `geojson_file: ""`：保持空字符串，场景几何一律走「场景几何」小节

#### 地点页（places）必备字段

故事用到的每个地点，`wiki/entities/places/` 页 frontmatter 必须写全：

- `lat` / `lng`：纬度在前、经度在后（中国范围 lat 约 18–54，lng 约 73–135，写反了地图会飞出去）
- `map_label`：地图上显示的短名字，如 `map_label: 洛阳`

```yaml
lat: 34.62
lng: 112.45
map_label: 洛阳
```

### Step 5: 补必要实体

如果 `周亚夫治军` 会引用到新人物、新地点、新势力，就补 canonical 实体页：

- 人物放 `wiki/entities/people/`
- 地点放 `wiki/entities/places/`
- 势力放 `wiki/entities/factions/`

原则是只补“故事真正会用到”的实体，不要为了完整而泛滥建页。

如果人物/地点/势力页已经存在，必须同步维护，不要只新建不更新：

- person 页：`events` 列表加上新 event id、`keywords` 补上故事关键词、正文事件列表补 `[[文件名]]` 链接
- place 页：「历史事件」小节补上新事件的链接

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

`storyId` 编号须与 Target Example 的编号规则一致：取现有最大编号 +1。

除了 `STORY_CONFIGS`，新用到的 person/faction/place id 还必须同步登记到脚本顶部的 `PERSON_FILE_BY_ID` / `FACTION_FILE_BY_ID` / `PLACE_FILE_BY_ID` 三张映射表，格式为 `id: "wiki/entities/...文件路径"`。三张表是硬编码的，漏登导出必失败（报错 `No file mapping configured`）。

`周亚夫治军` 的注册项建议按现有格式新增一条，放在最后一个故事后面，编号递增（当前已用到 `story_004`，下一个是 `story_005`）：

- `storyId: "story_005_zhou_yafu_zhijun"`
- `outputStoryFile: "story-005-zhou-yafu-zhijun.json"`

### Step 7: 点亮时间线

当且仅当下面两件事都完成后，再回到时间线把节点点亮：

1. story bundle 四件套已经写完
2. 导出器已经注册完成

这时把时间线那一行改成：

- `故事状态 = recorded`
- `story_id = story_005_zhou_yafu_zhijun`

### Step 8: 运行导出和站点同步

先在本仓库运行：

```bash
cd /Users/mialiu/repository/history-map/wiki
npm run export:history
```

再去前端目录运行：

```bash
cd /Users/mialiu/repository/history-map/site
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
- `../site/public/data/generated/` 里也有同步后的 JSON
- 打开生成的 `story-*.json`，确认 `timeline.label`/`lesson` 与本故事的时间线行一致（同年有多个故事时尤其要查）
- site 为单页应用，不存在独立故事详情路由，验证方式：`curl localhost:3000 | grep 故事名`
- 网页上能读到新内容，而不是旧的静态文案

## Minimal Deliverables For One New Story

以后每次新增一个真实故事，最少要交付这些文件：

- 3 到 4 个 raw 文件
- 3 到 4 个 `wiki/sources/` 文件
- 1 个 `event`
- 1 个 `map-layer`（含「场景标记」「场景几何」两个数据小节 + frontmatter `map_bounds`，必备，缺了地图渲染不出来）
- 1 个 `child-story`
- 1 个 `parent-note`
- 必要时若干人物 / 地点 / 势力页（地点页必须带 `lat`/`lng`/`map_label`）
- 1 条时间线更新
- 1 条 `STORY_CONFIGS` 注册项

地图与场景数据是录入必备项，不是可选项：AI agent 录入新故事时必须同时生成——地点坐标（places 页 `lat`/`lng`/`map_label`）、`map_bounds`、场景标记（`场景标记` 小节）、场景几何（`场景几何` 小节的 heartland/disturbance/route GeoJSON）。格式示例见上文 Step 4。

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

本项目是 `history-map` monorepo 的一部分：

- `wiki/`（本目录）：知识源，所有故事内容与地图场景数据的唯一来源
- `../site/`：Next.js 15 前端，纯渲染引擎，不存任何具体故事内容，一切数据由 `npm run export:history` + `npm run sync:data` 生成同步
