import { createRequire } from "node:module";
import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type FrontmatterValue = string | number | boolean | string[] | undefined;

type FrontmatterRecord = Record<string, FrontmatterValue>;

type StoryCompileConfig = {
  storyId: string;
  eventFile: string;
  childStoryFile: string;
  parentNoteFile: string;
  mapLayerFile: string;
  sourcePageFiles: string[];
  requiredMapSourceIds: string[];
  outputEventFile: string;
  outputStoryFile: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const PERSON_FILE_BY_ID: Record<string, string> = {
  person_liu_bang: "wiki/entities/people/刘邦.md",
  person_xiang_yu: "wiki/entities/people/项羽.md",
  person_cai_lun: "wiki/entities/people/蔡伦.md",
  person_han_ming_di: "wiki/entities/people/汉明帝.md",
  person_zhang_zhong_jing: "wiki/entities/people/张仲景.md",
  person_cao_cao: "wiki/entities/people/曹操.md",
  person_liu_bei: "wiki/entities/people/刘备.md",
  person_cao_zhi: "wiki/entities/people/曹植.md",
  person_wang_rong: "wiki/entities/people/王戎.md",
  person_ji_shao: "wiki/entities/people/嵇绍.md",
  person_guan_ning: "wiki/entities/people/管宁.md",
  person_hua_xin: "wiki/entities/people/华歆.md",
  person_xie_daoyun: "wiki/entities/people/谢道韫.md",
  person_wang_xizhi: "wiki/entities/people/王羲之.md",
  person_gu_kai_zhi: "wiki/entities/people/顾恺之.md",
  person_zu_ti: "wiki/entities/people/祖逖.md",
  person_wang_huizhi: "wiki/entities/people/王徽之.md",
  person_yang_xiu: "wiki/entities/people/杨修.md",
};

const FACTION_FILE_BY_ID: Record<string, string> = {
  faction_han_army: "wiki/entities/factions/汉军.md",
  faction_chu_army: "wiki/entities/factions/楚军.md",
  faction_caocao_forces: "wiki/entities/factions/曹军.md",
};

const PLACE_FILE_BY_ID: Record<string, string> = {
  place_gaixia: "wiki/entities/places/垓下.md",
  place_wujiang: "wiki/entities/places/乌江.md",
  place_luoyang_eastern_han: "wiki/entities/places/洛阳-东汉.md",
  place_tianzhu: "wiki/entities/places/天竺.md",
  place_nanyang: "wiki/entities/places/南阳.md",
  place_changsha: "wiki/entities/places/长沙.md",
  place_xuchang: "wiki/entities/places/许都.md",
  place_wancheng: "wiki/entities/places/宛城.md",
  place_yecheng: "wiki/entities/places/邺城.md",
  place_luoyang: "wiki/entities/places/洛阳.md",
  place_beihai: "wiki/entities/places/北海.md",
  place_jiankang: "wiki/entities/places/建康.md",
  place_jingkou: "wiki/entities/places/京口.md",
  place_shanyin: "wiki/entities/places/山阴.md",
  place_shanxian: "wiki/entities/places/剡县.md",
  place_lanting: "wiki/entities/places/兰亭.md",
  place_shangyu: "wiki/entities/places/上虞.md",
};

const STORY_CONFIGS: StoryCompileConfig[] = [
  {
    storyId: "story_000_xiang_yu_wujiang",
    eventFile: "wiki/entities/events/前202-项羽乌江自刎.md",
    childStoryFile: "wiki/synthesis/child-stories/前202-项羽乌江自刎-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/前202-项羽乌江自刎-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/前202-项羽乌江自刎-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/前202-项羽乌江自刎-史料提要.md",
      "wiki/sources/前202-项羽乌江自刎-史记摘录.md",
      "wiki/sources/前202-项羽乌江自刎-亲子讲述提纲.md",
      "wiki/sources/前202-项羽乌江自刎-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_xiang_yu_wujiang_historical_digest",
      "source_xiang_yu_wujiang_reading_note",
    ],
    outputEventFile: "event_xiang_yu_wujiang_202_bce.json",
    outputStoryFile: "story-000-xiang-yu-wujiang.json",
  },
  {
    storyId: "story_001_cai_lun_zao_zhi",
    eventFile: "wiki/entities/events/105-蔡伦造纸.md",
    childStoryFile: "wiki/synthesis/child-stories/105-蔡伦造纸-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/105-蔡伦造纸-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/105-蔡伦造纸-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/105-蔡伦造纸-史料提要.md",
      "wiki/sources/105-蔡伦造纸-亲子讲述提纲.md",
      "wiki/sources/105-蔡伦造纸-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_cai_lun_zao_zhi_historical_digest",
      "source_cai_lun_zao_zhi_reading_note",
    ],
    outputEventFile: "event_cai_lun_zao_zhi_105_ce.json",
    outputStoryFile: "story-001-cai-lun-zao-zhi.json",
  },
  {
    storyId: "story_002_han_ming_di_qiu_fa",
    eventFile: "wiki/entities/events/67-汉明帝求法.md",
    childStoryFile: "wiki/synthesis/child-stories/67-汉明帝求法-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/67-汉明帝求法-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/67-汉明帝求法-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/67-汉明帝求法-史料提要.md",
      "wiki/sources/67-汉明帝求法-亲子讲述提纲.md",
      "wiki/sources/67-汉明帝求法-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_han_ming_di_qiu_fa_historical_digest",
      "source_han_ming_di_qiu_fa_reading_note",
    ],
    outputEventFile: "event_han_ming_di_qiu_fa_67_ce.json",
    outputStoryFile: "story-002-han-ming-di-qiu-fa.json",
  },
  {
    storyId: "story_003_zhang_zhong_jing",
    eventFile: "wiki/entities/events/200-名医张仲景.md",
    childStoryFile: "wiki/synthesis/child-stories/200-名医张仲景-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/200-名医张仲景-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/200-名医张仲景-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/200-名医张仲景-史料提要.md",
      "wiki/sources/200-名医张仲景-亲子讲述提纲.md",
      "wiki/sources/200-名医张仲景-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_zhang_zhong_jing_historical_digest",
      "source_zhang_zhong_jing_reading_note",
    ],
    outputEventFile: "event_zhang_zhong_jing_200_ce.json",
    outputStoryFile: "story-003-zhang-zhong-jing.json",
  },
  {
    storyId: "story_004_zhu_jiu_lun_ying_xiong",
    eventFile: "wiki/entities/events/199-曹操煮酒论英雄.md",
    childStoryFile: "wiki/synthesis/child-stories/199-曹操煮酒论英雄-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/199-曹操煮酒论英雄-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/199-曹操煮酒论英雄-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/199-曹操煮酒论英雄-史料提要.md",
      "wiki/sources/199-曹操煮酒论英雄-亲子讲述提纲.md",
      "wiki/sources/199-曹操煮酒论英雄-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_zhu_jiu_lun_ying_xiong_historical_digest",
      "source_zhu_jiu_lun_ying_xiong_reading_note",
    ],
    outputEventFile: "event_zhu_jiu_lun_ying_xiong_199_ce.json",
    outputStoryFile: "story-004-zhu-jiu-lun-ying-xiong.json",
  },
  {
    storyId: "story_005_wang_mei_zhi_ke",
    eventFile: "wiki/entities/events/199-望梅止渴.md",
    childStoryFile: "wiki/synthesis/child-stories/199-望梅止渴-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/199-望梅止渴-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/199-望梅止渴-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/199-望梅止渴-史料提要.md",
      "wiki/sources/199-望梅止渴-亲子讲述提纲.md",
      "wiki/sources/199-望梅止渴-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_wang_mei_zhi_ke_historical_digest",
      "source_wang_mei_zhi_ke_reading_note",
    ],
    outputEventFile: "event_wang_mei_zhi_ke_199_ce.json",
    outputStoryFile: "story-005-wang-mei-zhi-ke.json",
  },
  {
    storyId: "story_006_cao_zhi_qi_bu_cheng_shi",
    eventFile: "wiki/entities/events/220-曹植七步成诗.md",
    childStoryFile: "wiki/synthesis/child-stories/220-曹植七步成诗-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/220-曹植七步成诗-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/220-曹植七步成诗-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/220-曹植七步成诗-史料提要.md",
      "wiki/sources/220-曹植七步成诗-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_cao_zhi_qi_bu_cheng_shi_historical_digest",
    ],
    outputEventFile: "event_cao_zhi_qi_bu_cheng_shi_220_ce.json",
    outputStoryFile: "story-006-cao-zhi-qi-bu-cheng-shi.json",
  },
  {
    storyId: "story_007_wang_rong_dao_bian_ku_li",
    eventFile: "wiki/entities/events/245-王戎道边苦李.md",
    childStoryFile: "wiki/synthesis/child-stories/245-王戎道边苦李-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/245-王戎道边苦李-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/245-王戎道边苦李-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/245-王戎道边苦李-史料提要.md",
      "wiki/sources/245-王戎道边苦李-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_wang_rong_dao_bian_ku_li_historical_digest",
    ],
    outputEventFile: "event_wang_rong_dao_bian_ku_li_245_ce.json",
    outputStoryFile: "story-007-wang-rong-dao-bian-ku-li.json",
  },
  {
    storyId: "story_008_ji_shao_he_li_ji_qun",
    eventFile: "wiki/entities/events/280-嵇绍鹤立鸡群.md",
    childStoryFile: "wiki/synthesis/child-stories/280-嵇绍鹤立鸡群-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/280-嵇绍鹤立鸡群-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/280-嵇绍鹤立鸡群-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/280-嵇绍鹤立鸡群-史料提要.md",
      "wiki/sources/280-嵇绍鹤立鸡群-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_ji_shao_he_li_ji_qun_historical_digest",
    ],
    outputEventFile: "event_ji_shao_he_li_ji_qun_280_ce.json",
    outputStoryFile: "story-008-ji-shao-he-li-ji-qun.json",
  },
  {
    storyId: "story_009_guan_ning_ge_xi",
    eventFile: "wiki/entities/events/190-管宁割席.md",
    childStoryFile: "wiki/synthesis/child-stories/190-管宁割席-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/190-管宁割席-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/190-管宁割席-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/190-管宁割席-史料提要.md",
      "wiki/sources/190-管宁割席-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_guan_ning_ge_xi_historical_digest",
    ],
    outputEventFile: "event_guan_ning_ge_xi_190_ce.json",
    outputStoryFile: "story-009-guan-ning-ge-xi.json",
  },
  {
    storyId: "story_010_xie_daoyun_yong_xue",
    eventFile: "wiki/entities/events/375-谢道韫咏雪.md",
    childStoryFile: "wiki/synthesis/child-stories/375-谢道韫咏雪-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/375-谢道韫咏雪-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/375-谢道韫咏雪-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/375-谢道韫咏雪-史料提要.md",
      "wiki/sources/375-谢道韫咏雪-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_xie_daoyun_yong_xue_historical_digest",
    ],
    outputEventFile: "event_xie_daoyun_yong_xue_375_ce.json",
    outputStoryFile: "story-010-xie-daoyun-yong-xue.json",
  },
  {
    storyId: "story_011_wang_xizhi_tan_fu_dong_chuang",
    eventFile: "wiki/entities/events/330-王羲之坦腹东床.md",
    childStoryFile: "wiki/synthesis/child-stories/330-王羲之坦腹东床-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/330-王羲之坦腹东床-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/330-王羲之坦腹东床-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/330-王羲之坦腹东床-史料提要.md",
      "wiki/sources/330-王羲之坦腹东床-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_wang_xizhi_tan_fu_dong_chuang_historical_digest",
    ],
    outputEventFile: "event_wang_xizhi_tan_fu_dong_chuang_330_ce.json",
    outputStoryFile: "story-011-wang-xizhi-tan-fu-dong-chuang.json",
  },
  {
    storyId: "story_012_gu_kai_zhi_jian_zhi_jia_jing",
    eventFile: "wiki/entities/events/380-顾恺之渐至佳境.md",
    childStoryFile: "wiki/synthesis/child-stories/380-顾恺之渐至佳境-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/380-顾恺之渐至佳境-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/380-顾恺之渐至佳境-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/380-顾恺之渐至佳境-史料提要.md",
      "wiki/sources/380-顾恺之渐至佳境-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_gu_kai_zhi_jian_zhi_jia_jing_historical_digest",
    ],
    outputEventFile: "event_gu_kai_zhi_jian_zhi_jia_jing_380_ce.json",
    outputStoryFile: "story-012-gu-kai-zhi-jian-zhi-jia-jing.json",
  },
  {
    storyId: "story_013_zu_ti_wen_ji_qi_wu",
    eventFile: "wiki/entities/events/313-祖逖闻鸡起舞.md",
    childStoryFile: "wiki/synthesis/child-stories/313-祖逖闻鸡起舞-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/313-祖逖闻鸡起舞-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/313-祖逖闻鸡起舞-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/313-祖逖闻鸡起舞-史料提要.md",
      "wiki/sources/313-祖逖闻鸡起舞-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_zu_ti_wen_ji_qi_wu_historical_digest",
    ],
    outputEventFile: "event_zu_ti_wen_ji_qi_wu_313_ce.json",
    outputStoryFile: "story-013-zu-ti-wen-ji-qi-wu.json",
  },
  {
    storyId: "story_014_wang_huizhi_xue_ye_fang_dai",
    eventFile: "wiki/entities/events/360-王徽之雪夜访戴.md",
    childStoryFile: "wiki/synthesis/child-stories/360-王徽之雪夜访戴-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/360-王徽之雪夜访戴-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/360-王徽之雪夜访戴-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/360-王徽之雪夜访戴-史料提要.md",
      "wiki/sources/360-王徽之雪夜访戴-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_wang_huizhi_xue_ye_fang_dai_historical_digest",
    ],
    outputEventFile: "event_wang_huizhi_xue_ye_fang_dai_360_ce.json",
    outputStoryFile: "story-014-wang-huizhi-xue-ye-fang-dai.json",
  },
  {
    storyId: "story_015_yang_xiu_jue_miao_hao_ci",
    eventFile: "wiki/entities/events/199-杨修绝妙好辞.md",
    childStoryFile: "wiki/synthesis/child-stories/199-杨修绝妙好辞-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/199-杨修绝妙好辞-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/199-杨修绝妙好辞-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/199-杨修绝妙好辞-史料提要.md",
      "wiki/sources/199-杨修绝妙好辞-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_yang_xiu_jue_miao_hao_ci_historical_digest",
    ],
    outputEventFile: "event_yang_xiu_jue_miao_hao_ci_199_ce.json",
    outputStoryFile: "story-015-yang-xiu-jue-miao-hao-ci.json",
  },
  {
    storyId: "story_016_wang_xizhi_lan_ting_ya_ji",
    eventFile: "wiki/entities/events/353-王羲之兰亭雅集.md",
    childStoryFile: "wiki/synthesis/child-stories/353-王羲之兰亭雅集-age7.md",
    parentNoteFile: "wiki/synthesis/parent-notes/353-王羲之兰亭雅集-家长说明.md",
    mapLayerFile: "wiki/entities/map-layers/353-王羲之兰亭雅集-地图计划.md",
    sourcePageFiles: [
      "wiki/sources/353-王羲之兰亭雅集-史料提要.md",
      "wiki/sources/353-王羲之兰亭雅集-小星星讲述.md",
    ],
    requiredMapSourceIds: [
      "source_wang_xizhi_lan_ting_ya_ji_historical_digest",
    ],
    outputEventFile: "event_wang_xizhi_lan_ting_ya_ji_353_ce.json",
    outputStoryFile: "story-016-wang-xizhi-lan-ting-ya-ji.json",
  },
];

const require = createRequire(import.meta.url);

// 中国全景默认视野：[west, south, east, north]，map-layer 缺 map_bounds 时使用。
const DEFAULT_MAP_BOUNDS = [78.0, 15.5, 132.0, 44.5];

function loadZod() {
  const lookupPaths = [
    path.join(ROOT, "node_modules"),
    process.env.NODE_PATH,
    process.env.CODEX_NODE_MODULES,
    "/Users/mialiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules",
  ].filter((value): value is string => Boolean(value));

  for (const lookupPath of lookupPaths) {
    try {
      const resolved = require.resolve("zod", { paths: [lookupPath] });
      return require(resolved);
    } catch {
      // Try next candidate.
    }
  }

  try {
    return require("zod");
  } catch {
    throw new Error(
      "Unable to load Zod. Install it locally or make it available via NODE_PATH before running export.",
    );
  }
}

const { z } = loadZod();

const stringArraySchema = z.array(z.string().min(1));

const eventFrontmatterSchema = z.object({
  type: z.literal("event"),
  id: z.string().min(1),
  title: z.string().min(1),
  created: z.string().min(1),
  updated: z.string().min(1),
  review_status: z.string().min(1),
  source_refs: stringArraySchema.min(1),
  year: z.number().int(),
  period: z.string().min(1),
  era: z.string().min(1),
  event_type: z.string().min(1),
  factions: stringArraySchema,
  people: stringArraySchema.min(1),
  places: stringArraySchema.min(1),
  content_mode: z.string().min(1),
  child_ready: z.boolean(),
  map_required: z.boolean(),
  certainty: z.enum(["high", "medium", "low"]),
  sources: stringArraySchema.min(1),
  causes: stringArraySchema.optional(),
  effects: stringArraySchema.optional(),
});

const childStoryFrontmatterSchema = z.object({
  type: z.literal("child_story"),
  id: z.string().min(1),
  title: z.string().min(1),
  created: z.string().min(1),
  updated: z.string().min(1),
  review_status: z.string().min(1),
  source_refs: stringArraySchema.min(1),
  event: z.string().min(1),
  age_level: z.number().int(),
  content_mode: z.string().min(1),
  child_ready: z.boolean(),
});

const parentNoteFrontmatterSchema = z.object({
  type: z.literal("parent_note"),
  id: z.string().min(1),
  title: z.string().min(1),
  created: z.string().min(1),
  updated: z.string().min(1),
  review_status: z.string().min(1),
  source_refs: stringArraySchema.min(1),
  event: z.string().min(1),
});

const mapLayerFrontmatterSchema = z.object({
  type: z.literal("map_layer"),
  id: z.string().min(1),
  title: z.string().min(1),
  created: z.string().min(1),
  updated: z.string().min(1),
  review_status: z.string().min(1),
  source_refs: stringArraySchema.min(1),
  year: z.number().int(),
  event: z.string().min(1),
  display_type: z.string().min(1),
  certainty: z.enum(["high", "medium", "low"]),
  geojson_file: z.string(),
  map_bounds: z.preprocess(
    (value) => (Array.isArray(value) ? value.map((item) => Number(item)) : value),
    z.array(z.number()).length(4).optional(),
  ),
  related_factions: stringArraySchema,
  related_places: stringArraySchema,
});

const factionFrontmatterSchema = z.object({
  type: z.literal("faction"),
  id: z.string().min(1),
  title: z.string().min(1),
  name: z.string().min(1),
  review_status: z.string().min(1),
  color: z.string().min(1),
  source_refs: stringArraySchema.min(1),
});

const placeFrontmatterSchema = z.object({
  type: z.literal("place"),
  id: z.string().min(1),
  title: z.string().min(1),
  name: z.string().min(1),
  review_status: z.string().min(1),
  certainty: z.enum(["high", "medium", "low"]),
  source_refs: stringArraySchema.min(1),
  lat: z.number(),
  lng: z.number(),
  map_label: z.string().min(1),
});

const personFrontmatterSchema = z.object({
  type: z.literal("person"),
  id: z.string().min(1),
  title: z.string().min(1),
  name: z.string().min(1),
  review_status: z.string().min(1),
  roles: stringArraySchema.min(1),
  source_refs: stringArraySchema.min(1),
});

const sourceFrontmatterSchema = z.object({
  type: z.literal("source"),
  id: z.string().min(1),
  title: z.string().min(1),
  created: z.string().min(1),
  updated: z.string().min(1),
  review_status: z.string().min(1),
  source_refs: stringArraySchema.min(1),
  content_mode: z.string().min(1),
  child_ready: z.boolean(),
  sources: stringArraySchema.min(1),
});

const storyBundleSchema = z.object({
  story_id: z.string().min(1),
  review_status: z.string().min(1),
  timeline: z.object({
    year: z.number().int(),
    label: z.string().min(1),
    lesson: z.string().min(1),
  }),
  event: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    type: z.string().min(1),
    year: z.number().int(),
    result: z.string().min(1),
    importance: z.string().min(1),
  }),
  sources: z.object({
    page_ids: stringArraySchema.min(1),
    raw_files: stringArraySchema.min(1),
    bibliography: stringArraySchema.min(1),
  }),
  people: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      role: z.string().min(1),
    }),
  ),
  factions: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      color: z.string().min(1),
    }),
  ),
  places: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      certainty: z.enum(["high", "medium", "low"]),
      lat: z.number(),
      lng: z.number(),
      map_label: z.string().min(1),
    }),
  ),
  child_story: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
  }),
  panel: z.object({
    child_spotlight: z.string().min(1),
    year_tags: z.array(z.string().min(1)).min(1),
    map_focus: z.array(z.string().min(1)).min(1),
    reading_keys: z.array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
      }),
    ).min(1),
    memory_anchors: z.array(z.string().min(1)).min(1),
    parent_prompt: z.array(z.string().min(1)).min(1),
  }),
  narration_flow: z.array(
    z.object({
      label: z.string().min(1),
      value: z.string().min(1),
    }),
  ).min(1),
  scene: z.object({
    deck: z.string().min(1),
    map_headline: z.string().min(1),
    map_headline_en: z.string().min(1),
    meta_label: z.string().min(1),
    caption: z.string().min(1),
    // 按需叠加的历史政权边界（public/data/historical/<id>.geojson）。
    // null = 纯净 8 大区底座（传记类故事）；有值 = 战争/割据故事淡入政权色块。
    overlay_boundary: z.enum(["chuhan", "sanguo"]).nullable().optional(),
    bounds: z.array(z.number()).length(4),
    annotations: z.array(
      z.object({
        kind: z.enum(["region", "disturbance"]),
        label: z.string().min(1),
        left: z.string().optional(),
        right: z.string().optional(),
        top: z.string().optional(),
        bottom: z.string().optional(),
      }),
    ),
    legend: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
      }),
    ),
    markers: z.array(
      z.object({
        place_id: z.string().min(1),
        subtitle: z.string().min(1),
        kind: z.enum(["capital", "uprising"]),
      }),
    ),
    geojson: z.object({
      type: z.literal("FeatureCollection"),
      features: z.array(z.object({}).passthrough()),
    }),
  }),
  map_plan: z.object({
    id: z.string().min(1),
    display_type: z.string().min(1),
    certainty: z.enum(["high", "medium", "low"]),
  }),
});

const timelineRailSchema = z.object({
  milestones: z.array(
    z.object({
      year: z.number().int(),
      period: z.string().min(1),
      label: z.string().min(1),
      note: z.string().min(1),
      lesson: z.string().min(1),
      story_id: z.string().nullable(),
      story_status: z.enum(["recorded", "planned"]),
      region_id: z.string().nullable().default(null),
    }),
  ).min(1),
});

const eventBundleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int(),
  period: z.string().min(1),
  era: z.string().min(1),
  type: z.string().min(1),
  review_status: z.string().min(1),
  source_refs: z.array(z.string()).min(1),
  sources: z.object({
    page_ids: stringArraySchema.min(1),
    raw_files: stringArraySchema.min(1),
    bibliography: stringArraySchema.min(1),
  }),
  people: z.array(z.string()).min(1),
  factions: z.array(z.string()),
  places: z.array(z.string()).min(1),
  result: z.string().min(1),
  importance: z.string().min(1),
  child_summary: z.string().min(1),
  questions: z.array(z.string()).min(1),
  map_plan_id: z.string().min(1),
  child_story_id: z.string().min(1),
  parent_note_id: z.string().min(1),
});

function parseScalar(rawValue: string): FrontmatterValue {
  const value = rawValue.trim();
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "[]") return [];
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];

    const items: string[] = [];
    let current = "";
    let quote: '"' | "'" | null = null;

    for (let index = 0; index < inner.length; index += 1) {
      const character = inner[index];

      if ((character === '"' || character === "'") && (index === 0 || inner[index - 1] !== "\\")) {
        if (quote === character) {
          quote = null;
        } else if (quote === null) {
          quote = character;
        }
        current += character;
        continue;
      }

      if (character === "," && quote === null) {
        const parsed = parseScalar(current);
        if (typeof parsed !== "string") {
          items.push(String(parsed));
        } else if (parsed.trim()) {
          items.push(parsed.trim());
        }
        current = "";
        continue;
      }

      current += character;
    }

    const parsed = parseScalar(current);
    if (typeof parsed !== "string") {
      items.push(String(parsed));
    } else if (parsed.trim()) {
      items.push(parsed.trim());
    }

    return items.map((item) => item.trim());
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(markdown: string): { frontmatter: FrontmatterRecord; body: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Missing frontmatter block.");
  }

  const [, rawFrontmatter, body] = match;
  const frontmatter: FrontmatterRecord = {};
  let currentArrayKey: string | null = null;

  for (const rawLine of rawFrontmatter.split("\n")) {
    if (!rawLine.trim()) continue;

    const arrayItemMatch = rawLine.match(/^\s*-\s+(.*)$/);
    if (arrayItemMatch) {
      if (!currentArrayKey || !Array.isArray(frontmatter[currentArrayKey])) {
        throw new Error(`Array item found without active array key: "${rawLine}"`);
      }
      (frontmatter[currentArrayKey] as string[]).push(String(parseScalar(arrayItemMatch[1])));
      continue;
    }

    const keyValueMatch = rawLine.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!keyValueMatch) {
      throw new Error(`Unsupported frontmatter syntax: "${rawLine}"`);
    }

    const [, key, rawValue = ""] = keyValueMatch;
    const parsedValue = parseScalar(rawValue);

    if (rawValue.trim() === "") {
      frontmatter[key] = [];
      currentArrayKey = key;
    } else {
      frontmatter[key] = parsedValue;
      currentArrayKey = null;
    }
  }

  return { frontmatter, body };
}

function parseMarkdownSections(markdownBody: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = markdownBody.split("\n");
  let currentHeading = "__intro__";
  let buffer: string[] = [];

  const flush = () => {
    sections.set(currentHeading, buffer.join("\n").trim());
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      buffer = [];
      continue;
    }
    if (line.startsWith("# ")) continue;
    buffer.push(line);
  }

  flush();
  return sections;
}

function extractListItems(sectionText: string): string[] {
  return sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean);
}

function compactText(sectionText: string): string {
  const bullets = extractListItems(sectionText);
  if (bullets.length > 0) return bullets.join("；");
  return sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function extractParagraphText(sectionText: string): string {
  return sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("- ") && !/^\d+\.\s+/.test(line))
    .join(" ");
}

function extractFirstSentence(sectionText: string): string {
  return extractParagraphText(sectionText).replace(/^["“]|["”]$/g, "").trim();
}

function extractKeyValueItems(sectionText: string): Array<{ label: string; value: string }> {
  return extractListItems(sectionText)
    .map((item) => {
      const [label, value] = item.split("｜").map((part) => part.trim());
      if (!label || !value) return null;
      return { label, value };
    })
    .filter((item): item is { label: string; value: string } => Boolean(item));
}

function extractSingleValue(sectionText: string): string {
  return (
    extractParagraphText(sectionText) ||
    extractListItems(sectionText)[0] ||
    compactText(sectionText)
  ).trim();
}

function extractLegendItems(sectionText: string): Array<{ key: string; label: string }> {
  return extractListItems(sectionText)
    .map((item) => {
      const [key, label] = item.split("｜").map((part) => part.trim());
      if (!key || !label) return null;
      return { key, label };
    })
    .filter((item): item is { key: string; label: string } => Boolean(item));
}

type SceneMarker = {
  place_id: string;
  subtitle: string;
  kind: "capital" | "uprising";
};

function extractSceneMarkerItems(sectionText: string): SceneMarker[] {
  return extractListItems(sectionText)
    .map((item) => {
      const [placeId, subtitle, kindRaw] = item.split("｜").map((part) => part.trim());
      if (!placeId || !subtitle || !kindRaw) return null;
      if (kindRaw !== "capital" && kindRaw !== "uprising") {
        throw new Error(`Unsupported scene marker kind: ${kindRaw}`);
      }
      return { place_id: placeId, subtitle, kind: kindRaw };
    })
    .filter((item): item is SceneMarker => Boolean(item));
}

function extractSceneGeojson(sectionText: string): {
  type: "FeatureCollection";
  features: Array<Record<string, unknown>>;
} {
  const codeBlockMatch = sectionText.match(/```json\n([\s\S]*?)\n```/);
  if (!codeBlockMatch) {
    throw new Error("Scene geojson section missing ```json code block.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(codeBlockMatch[1]);
  } catch (error) {
    throw new Error(`Scene geojson JSON.parse failed: ${(error as Error).message}`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { type?: unknown }).type !== "FeatureCollection" ||
    !Array.isArray((parsed as { features?: unknown }).features)
  ) {
    throw new Error("Scene geojson must be a GeoJSON FeatureCollection with a features array.");
  }

  return parsed as { type: "FeatureCollection"; features: Array<Record<string, unknown>> };
}

function extractAnnotationItems(sectionText: string): Array<{
  kind: "region" | "disturbance";
  label: string;
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
}> {
  return extractListItems(sectionText)
    .map((item) => {
      const [kindRaw, label, positionRaw] = item.split("｜").map((part) => part.trim());
      if (!kindRaw || !label) return null;
      if (kindRaw !== "region" && kindRaw !== "disturbance") {
        throw new Error(`Unsupported annotation kind: ${kindRaw}`);
      }

      const annotation: {
        kind: "region" | "disturbance";
        label: string;
        left?: string;
        right?: string;
        top?: string;
        bottom?: string;
      } = { kind: kindRaw, label };

      if (positionRaw) {
        for (const part of positionRaw.split(";")) {
          const [positionKey, positionValue] = part.split(":").map((segment) => segment.trim());
          if (!positionKey || !positionValue) continue;
          if (positionKey === "left" || positionKey === "right" || positionKey === "top" || positionKey === "bottom") {
            annotation[positionKey] = positionValue;
          }
        }
      }

      return annotation;
    })
    .filter(
      (
        item,
      ): item is {
        kind: "region" | "disturbance";
        label: string;
        left?: string;
        right?: string;
        top?: string;
        bottom?: string;
      } => Boolean(item),
    );
}

function stripWikiMarkup(value: string): string {
  return value.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_match, target, _pipe, alias) => {
    return alias ?? target;
  }).trim();
}

function parseMarkdownTable(markdownBody: string): Array<Record<string, string>> {
  const tableLines = markdownBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (tableLines.length < 3) {
    throw new Error("Timeline table not found or incomplete.");
  }

  const cells = (line: string) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

  const headers = cells(tableLines[0]);
  const rows = tableLines.slice(2);

  return rows.map((row) => {
    const values = cells(row);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
}

async function readMarkdownPage(pagePath: string) {
  const absolutePath = path.join(ROOT, pagePath);
  const content = await readFile(absolutePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(content);
  return { absolutePath, frontmatter, body, sections: parseMarkdownSections(body) };
}

function failWithContext(label: string, error: unknown): never {
  if (error instanceof z.ZodError) {
    const message = error.issues
      .map((issue: { path: Array<string | number>; message: string }) => {
        return `${label}: ${issue.path.join(".") || "(root)"} ${issue.message}`;
      })
      .join("\n");
    throw new Error(message);
  }

  if (error instanceof Error) {
    throw new Error(`${label}: ${error.message}`);
  }

  throw new Error(`${label}: ${String(error)}`);
}

function stableOrder<T>(items: T[], getKey: (item: T) => string): T[] {
  return [...items].sort((a, b) => getKey(a).localeCompare(getKey(b), "zh-Hans-CN"));
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

async function assertFileExists(label: string, filePath: string) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${label}: missing file ${filePath}`);
  }
}

async function readEntityPages(ids: string[], fileMap: Record<string, string>, label: string) {
  return Promise.all(
    ids.map(async (id) => {
      const fileName = fileMap[id];
      if (!fileName) {
        throw new Error(`No file mapping configured for ${label} ${id}.`);
      }
      return readMarkdownPage(fileName);
    }),
  );
}

async function compileStory(
  config: StoryCompileConfig,
  timelineRows: Array<Record<string, string>>,
  outputDir: string,
) {
  const [eventPage, childStoryPage, parentNotePage, mapLayerPage, ...sourcePageDocs] =
    await Promise.all([
      readMarkdownPage(config.eventFile),
      readMarkdownPage(config.childStoryFile),
      readMarkdownPage(config.parentNoteFile),
      readMarkdownPage(config.mapLayerFile),
      ...config.sourcePageFiles.map((file) => readMarkdownPage(file)),
    ]);

  const event = eventFrontmatterSchema.parse(eventPage.frontmatter);
  const childStory = childStoryFrontmatterSchema.parse(childStoryPage.frontmatter);
  const parentNote = parentNoteFrontmatterSchema.parse(parentNotePage.frontmatter);
  const mapLayer = mapLayerFrontmatterSchema.parse(mapLayerPage.frontmatter);
  const sourcePages = stableOrder(
    sourcePageDocs.map((page) => sourceFrontmatterSchema.parse(page.frontmatter)),
    (item) => item.id,
  );

  const sourcePageIds = sourcePages.map((page) => page.id);
  const sourcePageIdSet = new Set(sourcePageIds);
  const rawSourceFiles = uniqueStrings(sourcePages.flatMap((page) => page.sources));
  const bibliography = uniqueStrings(
    [
      ...event.source_refs.filter((ref) => !ref.startsWith("source_")),
      ...sourcePages.flatMap((page) => page.source_refs.filter((ref) => !ref.startsWith("source_"))),
    ],
  );

  if (childStory.event !== event.id) {
    throw new Error(
      `Child story event mismatch: expected ${event.id}, received ${childStory.event}.`,
    );
  }

  if (parentNote.event !== event.id) {
    throw new Error(
      `Parent note event mismatch: expected ${event.id}, received ${parentNote.event}.`,
    );
  }

  if (mapLayer.event !== event.id) {
    throw new Error(
      `Map layer event mismatch: expected ${event.id}, received ${mapLayer.event}.`,
    );
  }

  for (const sourcePageId of sourcePageIds) {
    if (!event.source_refs.includes(sourcePageId)) {
      throw new Error(`Event source_refs is missing canonical source page ${sourcePageId}.`);
    }
    if (!childStory.source_refs.includes(sourcePageId)) {
      throw new Error(`Child story source_refs is missing canonical source page ${sourcePageId}.`);
    }
    if (!parentNote.source_refs.includes(sourcePageId)) {
      throw new Error(`Parent note source_refs is missing canonical source page ${sourcePageId}.`);
    }
  }

  for (const requiredSourceId of config.requiredMapSourceIds) {
    if (!mapLayer.source_refs.includes(requiredSourceId)) {
      throw new Error(`Map layer source_refs is missing required source page ${requiredSourceId}.`);
    }
  }

  for (const sourceFile of event.sources) {
    if (!rawSourceFiles.includes(sourceFile)) {
      throw new Error(`Event sources contains ${sourceFile}, but no source page exposes it.`);
    }
  }

  for (const sourcePage of sourcePages) {
    for (const sourceRef of sourcePage.source_refs.filter((ref) => ref.startsWith("source_"))) {
      if (!sourcePageIdSet.has(sourceRef)) {
        throw new Error(`Source page ${sourcePage.id} references missing source page ${sourceRef}.`);
      }
    }
  }

  for (const rawSourceFile of rawSourceFiles) {
    await assertFileExists("raw source", path.join(ROOT, "raw/sources", rawSourceFile));
  }

  const historyMeaningSection = eventPage.sections.get("历史意义") ?? "";
  const eventResult =
    compactText(eventPage.sections.get("结果") ?? "") ||
    (Array.isArray(event.effects) ? event.effects.join("；") : "") ||
    compactText(historyMeaningSection);
  const eventImportance =
    compactText(eventPage.sections.get("为什么重要") ?? "") ||
    extractParagraphText(historyMeaningSection) ||
    compactText(historyMeaningSection);
  const eventQuestions = extractListItems(eventPage.sections.get("亲子问题") ?? "");
  const childSummary = compactText(eventPage.sections.get("儿童讲述") ?? "");

  if (!eventResult) throw new Error("Event page missing 结果 section content.");
  if (!eventImportance) throw new Error("Event page missing 为什么重要 section content.");
  if (eventQuestions.length === 0) throw new Error("Event page missing 亲子问题 list.");
  if (!childSummary) throw new Error("Event page missing 儿童讲述 section content.");

  const childSpotlight =
    extractFirstSentence(mapLayerPage.sections.get("先看地图") ?? "") ||
    extractFirstSentence(mapLayerPage.sections.get("儿童提示语") ?? "");
  const yearTags = extractListItems(mapLayerPage.sections.get("年度标签") ?? "");
  const mapFocus = extractListItems(mapLayerPage.sections.get("地图阅读步骤") ?? "");
  const readingKeys = extractKeyValueItems(mapLayerPage.sections.get("阅读抓手") ?? "");
  const memoryAnchors = extractListItems(mapLayerPage.sections.get("记忆锚点") ?? "");
  const parentPrompt = extractListItems(parentNotePage.sections.get("适合追问孩子的问题") ?? "");
  const sceneDeck = extractSingleValue(mapLayerPage.sections.get("页首导语") ?? "");
  const sceneHeadline = extractSingleValue(mapLayerPage.sections.get("地图标题") ?? "");
  const sceneHeadlineEn = extractSingleValue(mapLayerPage.sections.get("地图标题英文") ?? "");
  const sceneMetaLabel = extractSingleValue(mapLayerPage.sections.get("焦点标签") ?? "");
  const sceneCaption = extractSingleValue(mapLayerPage.sections.get("地图注脚") ?? "");
  const sceneAnnotations = extractAnnotationItems(mapLayerPage.sections.get("地图注记") ?? "");
  const sceneLegend = extractLegendItems(mapLayerPage.sections.get("图例") ?? "");
  const sceneBounds = Array.isArray(mapLayer.map_bounds) ? mapLayer.map_bounds : DEFAULT_MAP_BOUNDS;
  const sceneMarkers = extractSceneMarkerItems(mapLayerPage.sections.get("场景标记") ?? "");
  const sceneGeojson = extractSceneGeojson(mapLayerPage.sections.get("场景几何") ?? "");
  const narrationFlow = extractKeyValueItems(mapLayerPage.sections.get("讲述脉络") ?? "");
  if (narrationFlow.length === 0) throw new Error("Map layer page missing 讲述脉络 list.");

  if (!childSpotlight) throw new Error("Map layer page missing 先看地图 or 儿童提示语 content.");
  if (yearTags.length === 0) throw new Error("Map layer page missing 年度标签 list.");
  if (mapFocus.length === 0) throw new Error("Map layer page missing 地图阅读步骤 list.");
  if (readingKeys.length === 0) throw new Error("Map layer page missing 阅读抓手 list.");
  if (memoryAnchors.length === 0) throw new Error("Map layer page missing 记忆锚点 list.");
  if (parentPrompt.length === 0) throw new Error("Parent note page missing 适合追问孩子的问题 list.");
  if (!sceneDeck) throw new Error("Map layer page missing 页首导语 content.");
  if (!sceneHeadline) throw new Error("Map layer page missing 地图标题 content.");
  if (!sceneHeadlineEn) throw new Error("Map layer page missing 地图标题英文 content.");
  if (!sceneMetaLabel) throw new Error("Map layer page missing 焦点标签 content.");
  if (!sceneCaption) throw new Error("Map layer page missing 地图注脚 content.");
  if (sceneLegend.length === 0) throw new Error("Map layer page missing 图例 list.");
  if (sceneMarkers.length === 0) throw new Error("Map layer page missing 场景标记 list.");
  if (sceneGeojson.features.length === 0) throw new Error("Map layer page missing 场景几何 features.");

  for (const marker of sceneMarkers) {
    if (!event.places.includes(marker.place_id)) {
      throw new Error(
        `Scene marker place_id ${marker.place_id} is not listed in event places [${event.places.join(", ")}].`,
      );
    }
  }

  const timelineRow =
    timelineRows.find(
      (row) =>
        row["年份"] === String(event.year) &&
        stripWikiMarkup(row["事件"]?.trim() || "") === event.title,
    ) ?? timelineRows.find((row) => row["年份"] === String(event.year));
  if (!timelineRow) {
    throw new Error(`Timeline is missing year ${event.year}.`);
  }

  const [personPages, factionPages, placePages] = await Promise.all([
    readEntityPages(event.people, PERSON_FILE_BY_ID, "person"),
    readEntityPages(event.factions, FACTION_FILE_BY_ID, "faction"),
    readEntityPages(event.places, PLACE_FILE_BY_ID, "place"),
  ]);

  const people = stableOrder(
    personPages.map((page) => personFrontmatterSchema.parse(page.frontmatter)),
    (item) => item.id,
  );
  const factions = stableOrder(
    factionPages.map((page) => factionFrontmatterSchema.parse(page.frontmatter)),
    (item) => item.id,
  );
  const places = stableOrder(
    placePages.map((page) => placeFrontmatterSchema.parse(page.frontmatter)),
    (item) => item.id,
  );

  const eventJson = eventBundleSchema.parse({
    id: event.id,
    title: event.title,
    year: event.year,
    period: event.period,
    era: event.era,
    type: event.event_type,
    review_status: event.review_status,
    source_refs: event.source_refs,
    sources: {
      page_ids: sourcePageIds,
      raw_files: rawSourceFiles,
      bibliography,
    },
    people: stableOrder([...event.people], (item) => item),
    factions: stableOrder([...event.factions], (item) => item),
    places: stableOrder([...event.places], (item) => item),
    result: eventResult,
    importance: eventImportance,
    child_summary: childSummary,
    questions: eventQuestions,
    map_plan_id: mapLayer.id,
    child_story_id: childStory.id,
    parent_note_id: parentNote.id,
  });

  const storyJson = storyBundleSchema.parse({
    story_id: config.storyId,
    review_status: event.review_status,
    timeline: {
      year: event.year,
      label: event.title,
      lesson: timelineRow["孩子要理解"],
    },
    event: {
      id: event.id,
      title: event.title,
      type: event.event_type,
      year: event.year,
      result: eventResult,
      importance: eventImportance,
    },
    sources: {
      page_ids: sourcePageIds,
      raw_files: rawSourceFiles,
      bibliography,
    },
    people: people.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.roles[0],
    })),
    factions: factions.map((faction) => ({
      id: faction.id,
      name: faction.name,
      color: faction.color,
    })),
    places: places.map((place) => ({
      id: place.id,
      name: place.name,
      certainty: place.certainty,
      lat: place.lat,
      lng: place.lng,
      map_label: place.map_label,
    })),
    child_story: {
      id: childStory.id,
      title: childStoryPage.body
        .split("\n")
        .find((line) => line.startsWith("# "))
        ?.replace(/^#\s+/, "")
        .trim() ?? childStory.title,
    },
    panel: {
      child_spotlight: childSpotlight,
      year_tags: yearTags,
      map_focus: mapFocus,
      reading_keys: readingKeys,
      memory_anchors: memoryAnchors,
      parent_prompt: parentPrompt,
    },
    narration_flow: narrationFlow,
    scene: {
      deck: sceneDeck,
      map_headline: sceneHeadline,
      map_headline_en: sceneHeadlineEn,
      meta_label: sceneMetaLabel,
      caption: sceneCaption,
      // 政权叠加声明：wiki 地图计划「政权叠加」区块填写 chuhan/sanguo；
      // 未填写 → null（纯净 8 大区底座）
      overlay_boundary: extractSingleValue(mapLayerPage.sections.get("政权叠加") ?? "").trim() || null,
      bounds: sceneBounds,
      annotations: sceneAnnotations,
      legend: sceneLegend,
      markers: sceneMarkers,
      geojson: sceneGeojson,
    },
    map_plan: {
      id: mapLayer.id,
      display_type: mapLayer.display_type,
      certainty: mapLayer.certainty,
    },
  });

  await writeFile(
    path.join(outputDir, config.outputEventFile),
    `${JSON.stringify(eventJson, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outputDir, config.outputStoryFile),
    `${JSON.stringify(storyJson, null, 2)}\n`,
    "utf8",
  );
}

async function clearGeneratedStoryExports(outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const fileNames = await readdir(outputDir);

  await Promise.all(
    fileNames
      .filter(
        (fileName) =>
          fileName.startsWith("event_") ||
          fileName.startsWith("story-") ||
          fileName === "timeline-rail.json",
      )
      .map((fileName) => unlink(path.join(outputDir, fileName))),
  );
}

async function exportTimelineRail(
  timelineRows: Array<Record<string, string>>,
  outputDir: string,
) {
  const milestones = timelineRows.map((row) => {
    const year = Number(row["年份"]);
    if (!Number.isInteger(year)) {
      throw new Error(`Invalid timeline year: ${row["年份"]}`);
    }

    const storyId = row["story_id"]?.trim() || null;
    const storyStatusRaw = row["故事状态"]?.trim() || (storyId ? "recorded" : "planned");
    // region_id 为可选列：表格暂不加列时字段缺省 null，站点种子表兜底（plan.md）
    const regionId = row["region_id"]?.trim() || null;

    return {
      year,
      period: stripWikiMarkup(row["时代"]?.trim() || "历史时间轴"),
      label: stripWikiMarkup(row["事件"]?.trim() || "未命名节点"),
      note: stripWikiMarkup(row["时间轴提示"]?.trim() || row["地图变化"]?.trim() || "历史节点"),
      lesson: stripWikiMarkup(row["孩子要理解"]?.trim() || row["结果"]?.trim() || "理解这个历史节点的位置"),
      story_id: storyId,
      story_status: storyStatusRaw,
      region_id: regionId,
    };
  });

  const timelineRail = timelineRailSchema.parse({ milestones });
  await writeFile(
    path.join(outputDir, "timeline-rail.json"),
    `${JSON.stringify(timelineRail, null, 2)}\n`,
    "utf8",
  );
}

async function main() {
  const timelinePage = await readMarkdownPage("wiki/synthesis/curriculum/小星星历史时间线.md");
  const timelineRows = parseMarkdownTable(timelinePage.body);
  const outputDir = path.join(ROOT, "06_Exports/json");
  await clearGeneratedStoryExports(outputDir);
  await exportTimelineRail(timelineRows, outputDir);

  for (const config of STORY_CONFIGS) {
    await compileStory(config, timelineRows, outputDir);
  }

  console.log(`Exported ${STORY_CONFIGS.length} history story bundle(s) successfully.`);
}

main().catch((error) => failWithContext("export-history-data", error));
