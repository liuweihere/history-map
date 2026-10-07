// 常驻"历史地理大区"（Regions）静态舞台的空间判定工具。
//
// 设计原则（见 plan.md）：
// - 8 大区 GeoJSON 独立加载、零依赖故事数据，常驻底层；
// - 有坐标的故事 → PIP 判定高亮所在大区；
// - 只有时间的 planned 里程碑 → 可选 region_id，无则置灰不动地图；
// - 显式种子表优先，几何判定回退。

export const REGION_GEOJSON_PATH = "/data/static/regions.geojson";

// 故事 → 大区的显式覆盖表（优先于 PIP 几何判定）。
// key: story_id；value: regions.geojson 里的 properties.id。
export const STORY_REGION_OVERRIDES = {
  story_000_xiang_yu_wujiang: "zhongyuan", // 垓下主场景在中原（乌江在江南，故事焦点取主场景）
  story_001_cai_lun_zao_zhi: "zhongyuan", // 洛阳
  story_002_han_ming_di_qiu_fa: "zhongyuan", // 洛阳（天竺在域外，不参与判定）
  story_003_zhang_zhong_jing: "jingchu", // 长沙主场景
  story_004_zhu_jiu_lun_ying_xiong: "zhongyuan", // 许都
  story_005_wang_mei_zhi_ke: "zhongyuan", // 宛城
};

// planned 里程碑 → 大区 种子表（无 story_id、无坐标的骨架节点）。
// key: "year|label"（与 timeline-rail.json 的行对应）；value: region id。
// wiki 时间线表格暂无 region_id 列，字段缺省 null 时由此表兜底。
export const MILESTONE_REGION_SEEDS = {
  "-202|汉朝建立": "guanzhong", // 定都长安
  "-154|周亚夫治军": "guanzhong", // 细柳营
  "-154|七国之乱": "zhongyuan", // 吴楚七国起于东方，主战场在中原—江淮
  "-139|张骞通西域": "hexi", // 出使路线经河西走廊
  "-100|苏武牧羊": "hexi", // 北海牧羊，取丝路北道意象
  "-33|昭君出塞": "yanzhao", // 出塞和亲走北方边道
  "73|班超经营西域": "hexi", // 投笔从戎经营西域
  "150|江南可采莲": "jiangnan", // 汉乐府·江南
  "184|黄巾起义": "zhongyuan", // 巨鹿起事波及中原
  "190|管宁割席": "qilu", // 北海朱虚（山东）
  "207|观沧海": "yanzhao", // 曹操北征乌桓登碣石
  "317|衣冠南渡": "jiangnan", // 晋室南迁建康
  "330|坦腹东床": "jiangnan", // 王羲之建康/会稽
  "360|雪夜访戴": "jiangnan", // 山阴剡溪
  "375|咏雪之才": "jiangnan", // 谢家乌衣巷
  "494|孝文帝迁都洛阳": "zhongyuan", // 平城迁洛阳
};

// 已知无对应大区（域外/塞外）的里程碑：置灰、地图不动，避免误高亮。
export const REGIONLESS_MILESTONES = new Set([
  "67|汉明帝求法", // 故事已录制，天竺在域外，由 story 选中逻辑接管
]);

/**
 * 射线法 point-in-polygon（支持 Polygon 单环）。
 */
export function pointInPolygon(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * 在 regions FeatureCollection 里找坐标所在的大区 Feature（不命中返回 null）。
 */
export function findRegionFeature(regionsGeojson, lng, lat) {
  if (!regionsGeojson || !Array.isArray(regionsGeojson.features)) return null;

  for (const feature of regionsGeojson.features) {
    const polygon =
      feature.geometry?.type === "Polygon" ? feature.geometry.coordinates : null;
    if (!polygon) continue;

    if (polygon.some((ring) => pointInPolygon(lng, lat, ring))) {
      return feature;
    }
  }
  return null;
}

/**
 * 故事 → 大区 id。显式覆盖表优先，否则用第一个命中的 place 坐标做 PIP 回退。
 */
export function regionIdForStory(regionsGeojson, story) {
  const override = story?.story_id ? STORY_REGION_OVERRIDES[story.story_id] : null;
  if (override) return override;

  const places = Array.isArray(story?.places) ? story.places : [];
  for (const place of places) {
    if (typeof place.lng !== "number" || typeof place.lat !== "number") continue;
    const feature = findRegionFeature(regionsGeojson, place.lng, place.lat);
    if (feature) return feature.properties.id;
  }
  return null;
}

/**
 * planned 里程碑 → 大区 id。
 * 优先级：wiki 导出的 region_id > 种子表 > null（置灰不动地图）。
 */
export function milestoneRegionId(milestone) {
  if (!milestone) return null;
  if (typeof milestone.region_id === "string" && milestone.region_id) {
    return milestone.region_id;
  }

  const key = `${milestone.year}|${milestone.label}`;
  if (REGIONLESS_MILESTONES.has(key)) return null;
  return MILESTONE_REGION_SEEDS[key] ?? null;
}

/**
 * 依据 regions GeoJSON 建大区索引（id → feature），供标签渲染用。
 */
export function buildRegionIndex(regionsGeojson) {
  const index = new Map();
  if (!regionsGeojson || !Array.isArray(regionsGeojson.features)) return index;
  for (const feature of regionsGeojson.features) {
    if (feature.properties?.id) index.set(feature.properties.id, feature);
  }
  return index;
}
