# PLAN · 常驻"历史地理大区"静态底衬图层（Regions as Static Stage）

> 状态：**已在本仓库完整落地并浏览器验证通过**（2026-10-04）。
> 数据链路（wiki 导出 → sync → build）全绿；旧快照的"图层不渲染"问题未复现。

## 背景与设计原则

山川河流的地理格局几千年不变。把 `Region` 定义为"静态的地理文化大区"，
作为地图上永不卸妆的固定舞台，对 6-7 岁儿童建立中国地理"大局观"极其友好。

- **非侵入**：不改动单故事选中状态机，不新增"未选中"UI 状态。
- **解耦渲染**：8 大区 GeoJSON 独立加载，零依赖故事数据，常驻底层。
- **渐进增强**（三层适配）：
  1. 大区图层独立渲染（零依赖，即使所有故事无坐标，8 大区依然常驻）；
  2. 有坐标的故事 → 落点 Marker + PIP 判定高亮所在大区；
  3. 只有时间的 planned 里程碑 → 可选 `region_id` 字段，点击时间轨 flyTo
     到大区中心并高亮；连 `region_id` 也没有 → 仅时间轨置灰，地图不动不崩。

## 八大区定义（data/static/regions.geojson）

| id | name | subtitle | color | label_position |
|----|------|----------|-------|----------------|
| guanzhong | 关中 | 帝王基业 | #E8E0CF | [108.6, 34.9] |
| zhongyuan | 中原 | 兵家必争 | #EAD9B8 | [114.6, 34.3] |
| jiangnan | 江南 | 水乡与诗词 | #DFE9DC | [120.2, 30.4] |
| bashu | 巴蜀 | 天府盆地 | #E3E7D4 | [105.6, 30.6] |
| yanzhao | 燕赵 | 燕赵悲歌 | #EDE3DA | [116.8, 39.2] |
| jingchu | 荆楚 | 江湖云梦 | #E0E6E4 | [112.8, 29.6] |
| qilu | 齐鲁 | 孔孟泰山 | #F0E4D0 | [119.6, 36.4] |
| hexi | 河西走廊 | 丝路驼铃 | #EAE2D8 | [99.6, 39.3] |

GeoJSON Feature 层带数字 `id`（1..8，供 feature-state 用），properties 含
`{ id, name, subtitle, color, label_position, focus_zoom }`，多边形为 8-11 顶点
简易 Polygon。关键校验点：垓下(117.35, 33.0) ∈ 中原、乌江(118.50, 31.7) ∈ 江南。

## 渲染与交互（MapLibre）

- 图层 `regions-fill`（`fill-color: ["get","color"]`，opacity 0.2 → 高亮 0.45）
  与 `regions-outline`（#C5B59E 虚线 1.2px），插入故事图层之下（beforeId）。
- 大区名标签用 DOM Marker（`.region-label`，古风衬线 12px，#7A6855），
  因现有 style 未配置 glyphs，不能用 symbol 文本层。
- 高亮用 `map.setFeatureState({ source, id }, { highlight })`。
- 点击大区多边形：`flyTo(center, focus_zoom ?? 6)` + 高亮，不改选中状态。
- 故事加载后按 `regionIdForStory()` 高亮所在大区（显式覆盖表优先，PIP 回退）。
- planned 里程碑点击：仅 flyTo + 高亮（`focusRegion: { id, nonce }` prop）。

## 文件改动清单（在 llm-wiki 旧快照中已完成）

| 文件 | 动作 | 内容 |
|------|------|------|
| `site/public/data/static/regions.geojson` | 新增 | 8 大区 FeatureCollection |
| `site/lib/history-regions.js` | 新增 | pointInPolygon / findRegionFeature / regionIdForStory / milestoneRegionId + 种子表（16 条 planned 里程碑映射） |
| `site/components/history-map-stage.jsx` | 修改 | regions 图层垫底、DOM 标签、feature-state 高亮、大区点击 flyTo、focusRegion prop |
| `site/components/history-atlas-app.jsx` | 修改 | buildMilestones 增加 regionId、interactive 放宽、点击分支、focusRegion 状态（切故事时重置） |
| `site/app/globals.css` | 修改 | `.region-label` 系列 + `.timeline-stop--preview` 虚线样式 |
| `wiki/scripts/export-history-data.ts` | 修改 | timelineRailSchema 增加 `region_id: z.string().nullable().default(null)`，读表 `region_id` 列（表格暂不加列，字段缺省 null，站点种子表兜底） |

时间轨状态新增 `preview`：无 story_id 但有 region 的 planned 里程碑可点击
（虚线圆圈样式），点击后地图飞至对应大区。

## 遗留问题

- 【已解决】浏览器验证时发现：旧快照站点上地图 story marker 与大区图层均未渲染
  （DOM 0 marker，无控制台报错、fetch 均 200）——经确认为旧快照环境特有的问题，
  与 Regions 实现本身无关；移植到本仓库时不再视为阻塞项。
- 【已验证】本仓库浏览器实测：8 大区标签 DOM 全渲染、位置地理关系正确、
  点击江南标签 flyTo 生效（地图飞至聚焦、其余大区标签移出视野）、
  无控制台错误；PIP 全部校验点通过（垓下∈中原、乌江∈江南、曲阜∈齐鲁、
  白登∈域外等 29 项）。

## 移植到本仓库（history-map）的适配说明

本仓库已比旧快照演化很多：水彩底图、`dynasties.geojson`（疆域随朝代）、
story_005、地图场景数据迁入 wiki（site/lib 已无 story-map-geo.js）。
移植时注意：

1. regions 图层应插在 dynasties 图层之下/之上需按水彩新样式视觉调参
   （fill-opacity 0.2 起步，避免与朝代疆域叠加过重）。
2. `regionIdForStory` 的坐标来源从 `placeCoordinates`（story-map-geo.js）
   改为本仓库 wiki 导出的地图场景数据里的 place 坐标。
3. 里程碑 `region_id` 的 wiki 侧表格列与本仓库 schema 同步（可选列）。
4. 8 大区与 dynasties 疆域是互补关系：Region = 常驻地理骨架（不变），
   dynasties = 政治疆域（随时间轴变化），两者叠加正是"舞台 + 剧目"。

## 落地记录（本仓库实际改动）

| 文件 | 内容 |
|------|------|
| `site/public/data/static/regions.geojson` | 8 大区 FeatureCollection，Feature 数字 id 1..8（feature-state 主键），深化水彩色板（原 pastel 与纸面过近不可见） |
| `site/lib/history-regions.js` | pointInPolygon / findRegionFeature / regionIdForStory / milestoneRegionId + 6 条 story 覆盖表 + 16 条 planned 种子表 |
| `site/components/history-map-stage.jsx` | regions-fill/outline 位于 china-backdrop **之上**、dynasties 之下（fill 0.45→高亮 0.75）、DOM 标签、feature-state 高亮、点击 flyTo(center, focus_zoom)、focusRegion prop、故事加载高亮所在大区 |
| `site/components/history-atlas-app.jsx` | buildMilestones 增加 regionId、preview 状态（虚线圆圈可点）、focusRegion 状态（切故事重置） |
| `site/app/globals.css` | `.region-label` 系列（古风衬线 12px、#7A6855）+ `.timeline-stop--preview` |
| `wiki/scripts/export-history-data.ts` | timelineRailSchema 增加 `region_id` 可空列，缺省 null，站点种子表兜底 |

多边形边界修正记录：燕赵西南角与齐鲁北部重叠（济南误入燕赵）→ 燕赵边界
北收、齐鲁西南角下扩包裹曲阜、中原东北角收窄让出曲阜给齐鲁。

## 视觉调参记录（三轮迭代）

**R1 不可见问题**：regions 图层垫底被不透明 `china-backdrop-fill`（#F8F2E8）
盖住 + pastel 色板与纸面过近 → 图层移到 backdrop 之上、色板深化。

**R2 过重问题**：0.45 opacity 在水彩底图上抢戏 → 降至 0.15（高亮 0.45），
线框回归 #C5B59E。

**R3 坐标重制（2026-10-07 用户紧急修整）**：8 大区多边形按明确的经纬范围
重写（关中 106.5~110.5/33.5~35.5、中原 111~116.5/33~36、江南 118~122.5/
29.5~33、巴蜀 102~108/28~32.5、燕赵 114.5~119.5/37~41、荆楚 110~115.5/
28~32.5、齐鲁 116.5~122.5/35~38.5、河西 96~104/37~41），中心点同步更新；
荆楚南界下移至 27.6 保证长沙 (112.98,28.19) ∈ 荆楚。校验点：南阳∈中原、
乌江∈江南、长沙∈荆楚、各区中心∈本区、垓下/邺城/敦煌∈域外。

**story-003 旧多边形清理**：`医圣故乡/坐堂行医` 虚线框与东汉疆域色块来自
wiki 地图数据（story-heartland/story-disturbance Polygon），非组件写死——
在 `wiki/entities/map-layers/200-名医张仲景-地图计划.md` 删除两个 Polygon
与两条 region 注记及图例 backdrop 项，只保留南阳/长沙 marker + 路线
LineString + "乱世瘟疫的年代"气氛注记，重新导出生效。

## 渲染分工定稿（2026-10-07 终极修正）

**排查确认：代码中不存在任何"点线转多边形"算法**（buffer/convex/turf/hull
全文检索零命中）。"套娃色块"的真正来源是各故事 wiki 地图计划里手写的
`story-heartland`/`story-disturbance` Polygon 数据被通用图层如实渲染。

**三层分工定稿（强约束）**：
1. 底层 Regions：`regions.geojson` 8 大区 fill(0.15)+虚线边框+纯文字标签
   （透明背景、text-shadow halo，无卡片框）；
2. 中层 Route：故事 geometry 的 LineString/MultiLineString → `story-route-line`
   （#8B5A2B、2.5px、[2,2] 虚线、0.85）；**全部 6 个故事的
   heartland/disturbance Polygon 已从 wiki 地图计划批量剥离**（导出审计：
   6/6 route-only geometry）；
3. 顶层 Markers：故事 places 的 DOM Marker 卡片。

**严禁**：代码中将 LineString/Point 转换为 Polygon 的任何算法。

另：验证时若在同一浏览器标签页反复导航数十次，WebGL 上下文耗尽会
导致 map 初始化静默失败（load 事件不发、0 marker）——换新标签页即恢复，
非代码问题，勿重复排查。

## 朝代疆域层彻底移除（2026-10-07 套娃根因修复）

**用户复报"还是套娃呀 项羽故事"后的排查结论**：浏览器实况证实页面仍
加载 `dynasties.geojson` —— 残留的第四层"朝代疆域"才是套娃根源。
项羽故事（前 202）命中 `chu-han` 疆域多边形，几乎覆盖整个中国，
以 fill-opacity 0.3 叠在 8 大区（0.15）之上，加上不透明底图形成三层色块叠加。

**三层分工规范里根本没有"朝代疆域层"的位置**，处理方式 = 整层删除而非调参：

- `history-map-stage.jsx` 删除：
  - `dynasties.geojson` fetch、`dynasty-boundaries` source、
    `dynasties-fill`/`dynasties-line` 图层对、`buildDynastyFilter()`、
    `dynastyLayersReady` state 及其 setFilter effect；
  - 死图层 `han-heartland-fill/outline`、`yellow-turban-disturbance-fill/outline`
    （数据侧早已剥离，纯代码残留）；
  - `currentYear` prop 及 `history-atlas-app.jsx` 的传参（时间轴年份变化
    不再驱动地图图层，`selectedYear` 仅用于里程碑交互态）。
- `dynasties.geojson` 数据文件保留在 `data/static/` 备用，不再被引用。
- 重建后 bundle 审计：`dynasties-fill|han-heartland|yellow-turban|dynasty-boundaries|buildDynastyFilter`
  在 `.next/static/chunks/` 零命中；`regions-fill`/`story-route-line` 正常在列。
- 视觉复核（http://localhost:3457 项羽故事）：8 大区水彩 + 垓下/乌江 Marker +
  单条棕色虚线南退路线，无任何叠加疆域色块。

最终叠放序（三层定稿）：`parchment-base → china-backdrop → regions(0.15)
→ story-route-line → DOM markers/labels`。

## 水彩晕染版图视觉升级（2026-10-07 第二轮）

**需求**：8 大区从"生硬多边形"升级为"自然水彩晕染版图"。

1. **虚线边框彻底移除**：删除 `regions-outline` line 图层，大区交界
   全靠柔和填充色差呈现，不再有任何描边。
2. **`regions.geojson` 重建为自然水彩边界**：新增
   `site/scripts/build-watercolor-regions.mjs`（确定性种子 mulberry32，
   可重复构建）。每区 8 点地 形骨架 → 沿边插入垂直方向微曲折中点
   （模拟山脊/河曲，偏移 ≤ 段长 18% 防自交）+ 质心外扩 0.22°~0.3°
   （邻区自然贴合）→ **每区 24 顶点**（要求 15~25）。
   骨架依自然地理手调：中原北缘抬至 ~35.4 接燕赵；江南西北角覆盖南京；
   燕赵东南角内收让出济南；河西走廊西延至敦煌、东南覆盖武威。
   验证：22 城归属 PIP 全过、无双重叠压（九江/太原在体系外留白属正常）。
3. **标签质感**（DOM Marker，等效 MapLibre Symbol 参数）：
   `font-size 15px / letter-spacing 0.2em / #5C4A38 深褐 /
   #FAF6F0 三层 halo (2/4/6px)`，副标同色系。
4. **高亮透明度**：默认 0.15 不变，高亮 0.45 → **0.38**（柔和不刺眼）。

验证注意：截图/快照工具取不到 WebGL canvas 时，先关掉多余地图标签页
（每页占一个 WebGL 上下文，累计十几个即耗尽 GPU 配额，地图静默空白），
主标签页刷新即恢复。

## 底图架构修正：现成矢量底图替代手画地理（2026-10-07 第三轮）

**架构死穴**：原 style 是近乎空白的 JSON + 手画 china-base 陆地轮廓，
没有海岸线/水系/地形，逼着用 GeoJSON 手补地理 → 永远像"干瘪贴纸"。

**修正**（`history-map-stage.jsx`）：
1. `maplibregl.Map.style` 直接载入 **CartoDB Positron**
   (`https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`)，
   海岸线/长江黄河水系/自然陆地自动呈现；
2. 彻底删除手画陆地：`china-base.geojson` fetch、`china-backdrop-fill/
   shadow/outline` 三图层、相关 `story001-overlay` 混装全部移除，
   source 只挂业务数据（路线 + 大区）；
3. `loadBasemapStyle()` 带离线退化：CDN 不可达时回退纯羊皮纸背景
   （`#EFE9DC`），并在容器挂 `map--basemap-off` class 去除滤镜，
   地图永不空白；
4. 古风滤镜：`.maplibregl-canvas { filter: sepia(0.15) contrast(0.95)
   brightness(1.02); }`（替换原 `filter: none` 两处残留）。

**叠放序（最终）**：CartoDB Positron 底图 → regions 水彩(0.15/0.38)
→ story-route-line → DOM markers/labels。

`china-base.geojson` 与 `scripts/build-china-base.mjs` 保留在仓库备用，
不再被前端引用。验证：bundle 中 `china-base` 零命中、CartoDB URL 在列；
浏览器复核 marker 渲染正常。

## 浅蓝海洋 + 马卡龙水彩版图（2026-10-07 第四轮视觉对齐）

**风格目标**：经典历史地图 —— 浅蓝海洋包裹米白陆地 + 低饱和马卡龙大区。

1. **底图调色**（`style.load` 后 `setPaintProperty`，Positron 图层 ID
   已实测核对）：
   - `water` → `#A2C9E6` 浅蓝海洋（`water_shadow` 同步 `#B4D2E9`）；
   - `background` → `#F6F3EB` 米白陆地；
   - `waterway` → `#77A3C7` 河流/海岸线加深；
   - `boundary_country_inner` → `#B8A98D` 国界柔褐。
2. **马卡龙大区色板**（regions.geojson color + 生成脚本
   `MACARON_PALETTE` 同步防回退）：
   关中 #EDE0C8 淡禾黄 / 中原 #F7D2C4 淡珊瑚橘 / 荆楚 #CBE3D5 淡水绿 /
   江南 #D9E2F3 淡浅蓝紫 / 巴蜀 #E2D8E8 淡丁香紫 / 燕赵 #D8E3D8 淡鼠尾草绿 /
   齐鲁 #FCE8D5 淡奶杏 / 河西 #E5E0CE 淡灰金。
3. **透明度**：regions-fill 未选中 **0.45**、高亮 **0.75**。
4. **标签**：`#3D352E` 深灰棕 + 白色半透明三段 halo，直接印在水彩块上，
   无卡片背景；canvas 滤镜去 sepia 改 `contrast(0.97) brightness(1.01)`
   （避免泛黄干扰马卡龙色）。

## 底图标签汉化：localIdeographFontFamily 本地字体方案（2026-10-07）

**问题**：底图（CartoDB Positron）标签全部英文（`{name_en}`）。

**排查**：瓦片自带 `name:zh` 字段（z7 青海湖一带实测存在），但公共字体
CDN 无任何 CJK pbf —— Carto/OpenFreeMap 仅拉丁（`Noto Sans SC` 等 404），
`fonts.openmaptiles.org` 返回假 200（HTML 404 页），demotiles 仅极简 Demo
拉丁切片。自托管完整 CJK 字体需数十兆，不值。

**方案（MapLibre 官方推荐路径）**：
1. Map 构造加 `localIdeographFontFamily: "'PingFang SC',
   'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"`
   —— CJK 字形由客户端本地字体即时生成 SDF，拉丁字符照常走 CDN pbf；
2. `style.load` 后把所有 symbol 层 text-field 批量切为
   `['coalesce', ['get','name:zh'], ['get','name:zh-Hans'],
   ['get','name:latin'], ['get','name']]`；
3. 曾试过"隐藏全部底图标签 + 自制 DOM 中文地理标签"的绕路方案，
   已撤销（geo-labels.json 及挂载代码删除）——底图 name:zh 本身
   自带中文海洋/江河/城市名，DOM 标签全冗余。

验证：bundle 含 localIdeographFontFamily；浏览器渲染正常。

## 历史政权按需叠加层（2026-10-07 三国预备）

**方案**："8 大区宏观常驻 + 特殊故事按需叠加"——五层渲染堆叠：
`CartoDB 底图 → regions(8 大区) → historical(政权, 可选) →
story-route → DOM markers`。

**数据管线**：
1. wiki schema（`export-history-data.ts`）scene 加 `overlay_boundary`：
   `z.enum(["chuhan","sanguo"]).nullable().optional()`，来源为地图计划
   md 的「政权叠加」区块（未填 → null 纯净底座）；
   注意导出后必须跑 `sync-history-data.mjs` 才会进 site；
2. `scripts/build-historical-boundaries.mjs` 生成
   `public/data/historical/{sanguo,chuhan}.geojson`：
   - **确定性水彩环**（非随机）：共享边两国对同一对锚点算出相同曲率
     中点（canonicalPair + 方向无关正弦），边界逐点重合 → 政权互斥，
     零重叠零缝隙（这是与 8 大区随机水彩的关键差异）；
   - 魏蜀/魏吴共享锚点常量（W_SHU_NW/NE、W_WU_NW/NE）标注在骨架里；
   - 色板：魏 #E8D5A3 / 蜀 #BCD9C3 / 吴 #B8CFE0；汉 #D9C8A8 / 西楚 #E5C8B8
     （各承接对应大区色系）；properties 带 name/capital/kind:"faction"；
   - 验证 18 城 PIP 全过：魏(洛阳/许昌/襄阳/合肥/街亭)、
     蜀(成都/汉中)、吴(建业/赤壁/江陵/广州)、
     汉(南郑/长安/成都)、西楚(彭城/垓下/南阳)。

**组件**（`history-map-stage.jsx`）：story.scene.overlay_boundary 有值时
fetch `/data/historical/<id>.geojson` → `historical-fill` 图层
（0.42/0.62 透明度 + 900ms 淡入过渡）+ 政权名 DOM 标签（`.faction-label`
大字 + 都城小注，21px/10px）+ regions-fill 整体压暗让位
（0.45→0.12，高亮 0.75→0.2）。传记故事（overlay_boundary null）
不受影响，仍纯净 8 大区底座。

已为项羽故事（楚汉相争）声明 `chuhan` 叠加作为首个用例；
三国故事只需在地图计划 md 写「政权叠加: sanguo」即可。

### 叠加层视觉修正（2026-10-07 用户反馈：遮挡 8 大区 + 楚汉太小）

1. **透明度重配**：historical-fill 0.42→**0.30**（高亮 0.5），
   regions-fill 让位从 0.12 提回 **0.28**（高亮 0.45）——
   政权是"浮层"不是"遮挡层"，大区水彩与底图地理仍透出；
2. **楚汉疆域扩大**（骨架重锚）：
   - 西楚 = 梁楚九郡 + **江东**（都彭城；含会稽——乌江/吴中是项羽
     根据地，垓下→乌江退路线全程在楚境）；
   - 汉 = 关中 + 陇西 + 汉中 + 巴蜀（都标长安，前202 已迁都）；
   - 赵国（邯郸）/齐国（临淄）/洛阳刻意留白 → 给"当时不止两家"
     留教学空间；
   - 验证 13 地点 PIP 全过（含乌江/吴中/广陵属楚，
     邯郸/临淄/洛阳留白）。








## 2026-10-07 · 魏晋名士 12 故事批量录入（三站：中原北方 / 建康 / 山水江南）

### 录入清单（11 新故事 + 望梅止渴已有 = 12）

**第一站·中原北方**
- 220 曹植七步成诗（邺城/河北临漳）→ story_006，`overlay_boundary: sanguo`
- 245 王戎道边苦李（洛阳）→ story_007，纯净底座
- 280 嵇绍鹤立鸡群（洛阳）→ story_008，纯净底座
- 190 管宁割席（北海/山东潍坊青州）→ story_009，纯净底座
- 199 曹操望梅止渴（宛城）→ story_005（此前已录）

**第二站·建康（东晋都城）**
- 375 谢道韫咏雪 → story_010，纯净底座
- 330 王羲之坦腹东床 → story_011，纯净底座
- 380 顾恺之渐至佳境 → story_012，纯净底座
- 313 祖逖闻鸡起舞/击楫中流（京口/镇江）→ story_013，
  渡江 LineString（京口→长江北岸）

**第三站·山水江南（浙江）**
- 360 王徽之雪夜访戴（山阴→剡县）→ story_014，
  剡溪雪夜水路 6 点 LineString（全站最具留白意境的路线）
- 199 杨修绝妙好辞（上虞曹娥碑）→ story_015，纯净底座
- 353 王羲之兰亭雅集（绍兴兰亭）→ story_016，曲水流觞小溪线

### 每故事 5 件套 + entities
- events / child-stories(-age7) / parent-notes / map-layers /
  sources（史料提要 + **小星星讲述占位**——待孩子真讲后回填）；
- 新增 place 9：邺城、洛阳(通用)、北海、建康、京口、山阴、剡县、
  兰亭、上虞；新增 person 11：曹植、王戎、嵇绍、管宁、华歆、谢道韫、
  王羲之、顾恺之、祖逖、王徽之、杨修（frontmatter 按 schema：
  name/roles/source_refs/lat/lng/map_label/certainty）。

### 管线与站点
- `export-history-data.ts`：STORY_CONFIGS +11（story_006~016）、
  PERSON_FILE_BY_ID +11、PLACE_FILE_BY_ID +9；
- 时间线表：新增 7 行、升级 4 行 planned→recorded（管宁割席 190、
  坦腹东床 330、雪夜访戴 360、咏雪 375），97 节点 / 17 可唤醒；
- `history-atlas-app.jsx` 修复：同年双节点（如 220 三国鼎立 vs
  曹植七步成诗）dock 优先命中 interactive 节点，避免误显示
  "骨架节点，故事录制中"。

### 验证
- export 17 bundles ✅ / sync 35 files ✅ / next build ✅ /
  浏览器：目录 97 节点 17 已录制、11 个新故事可点击唤醒、
  曹植页 sanguo 叠加正常、七步导图 6 步完整展示 ✅
