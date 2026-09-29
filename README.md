# History Map · 小星星历史地图馆

面向儿童的中国历史知识系统：时间轴 + 地图叙事 + 人物关系 + 亲子讲述。

## 仓库结构

本仓库是 monorepo，包含两个子项目：

| 目录 | 说明 |
|------|------|
| `wiki/` | 内容生产后台（故事包知识编译器）：原始史料 → canonical 页面 → 导出 JSON |
| `site/` | 前端站点（Next.js + MapLibre）：消费导出的 JSON，渲染地图与时间轴 |

## 工作流

```text
wiki: raw/sources 录入 → wiki/sources 校正 → story bundle 四件套 → export:history
site: sync:data 拉取 06_Exports/json → build → 浏览器呈现
```

## 快速开始

```bash
# 1. 编译 wiki 内容为导出 JSON
cd wiki
npm install
npm run export:history

# 2. 同步数据到站点并启动
cd ../site
npm install
npm run sync:data
npm run dev        # 开发模式，http://localhost:3000
# 或
npm run build && npm run start   # 生产模式
```

## 核心概念

- **Story Bundle（故事包）**：一个真实历史故事的最小闭环 = 3-4 份 raw source + 3-4 份 canonical source + event / map-layer / child-story / parent-note 四件套 + 导出 JSON
- **时间线骨架**：83 个节点（上古 → 隋），其中前 202 项羽乌江自刎是唯一 `recorded` 故事，其余为 `planned` 占位
- **点亮机制**：孩子真实讲过的故事逐条从 `planned` 升级为 `recorded`，通过 `story_id` 联动地图站点

详见 `wiki/README.md`、`wiki/schema.md` 与 `wiki/wiki/synthesis/data-contract.md`。

## 许可

内部家庭项目，版权所有。
