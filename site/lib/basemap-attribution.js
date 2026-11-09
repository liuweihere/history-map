// Carto basemap attribution 纯逻辑（Phase 0：底图署名不悬空，fallback 不伪报）。
//
// 设计依据 PLAN.md V3 §5/§7 独立验收 #9：attributionControl:false 使底图署名悬空。
// 修复策略：在线时显示 CartoDB Positron 署名；离线纯色 fallback 时诚实标注
// 本地回退底图，不得伪报 Carto。许可评估保留人工关卡（不自动判定合规）。
//
// 此模块为无 React/maplibre 依赖的纯函数，供 history-map-stage.jsx 复用，
// 并由 test/basemap-attribution.test.mjs 覆盖。

// CartoDB Positron 底图的署名（在线时显示）。
// 完整许可评估为人工关卡（§5），此处只提供署名文本，不判定合规。
const CARTO_ATTRIBUTION = "© CARTO © OpenStreetMap contributors";

// 纯色回退底图的署名（离线时显示，不伪报 Carto）。
const FALLBACK_ATTRIBUTION = "本地回退底图（离线纯色 fallback）";

/**
 * 根据 basemap 在线状态返回正确的 attribution 文本。
 * @param {boolean} basemapOnline - Carto basemap 是否成功加载
 * @returns {string} 非空 attribution 文本
 */
export function buildBasemapAttribution(basemapOnline) {
  if (basemapOnline) {
    return CARTO_ATTRIBUTION;
  }
  return FALLBACK_ATTRIBUTION;
}
