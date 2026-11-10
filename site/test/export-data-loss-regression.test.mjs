// 回归测试：export-history-data.ts 数据丢失风险（事务式暂存提交）。
//
// 风险背景：旧版 main() 先 clearGeneratedStoryExports 再 buildTimelineMilestones
// 校验 / compileStory；任何 milestone_id 校验或故事编译失败都会在旧产物已被
// 删除后抛错，造成 story/event/timeline 旧文件丢失。
//
// 修复：runExport 把全部产物先写入同父级暂存目录，校验/编译全成功后再清理
// 旧产物并搬入；失败时仅清理暂存目录，旧产物原封不动。
//
// 本测试用「完全临时隔离的项目副本 + 注入输出目录」跑真实生产导出入口
// runExport，不触碰真实项目 wiki/06_Exports/json 的已有生成物。

import { test } from "node:test";
import assert from "node:assert/strict";
import { runExport } from "../../wiki/scripts/export-history-data.ts";
import {
  cp,
  rm,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
  access,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const WIKI_ROOT = path.join(REPO_ROOT, "wiki");
const REAL_JSON = path.join(WIKI_ROOT, "06_Exports/json");
const TIMELINE_REL = "wiki/synthesis/curriculum/小星星历史时间线.md";

// 复制真实 wiki/wiki + wiki/raw 到临时 rootDir，构成可被 runExport 读取的
// 隔离项目副本（不含 06_Exports，输出由注入的 outputDir 承载）。
async function makeFixtureRoot(label) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), `hm-export-${label}-`));
  await cp(path.join(WIKI_ROOT, "wiki"), path.join(rootDir, "wiki"), {
    recursive: true,
  });
  await cp(path.join(WIKI_ROOT, "raw"), path.join(rootDir, "raw"), {
    recursive: true,
  });
  return rootDir;
}

// 在临时 outputDir 中预置「旧产物」：复制真实生成文件 + 一个非生成物保留文件
// + 一个应被清理的 stale story- 文件。返回旧产物内容快照（路径->sha）。
async function seedOldOutputs(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const realFiles = await readdir(REAL_JSON);
  const snapshot = new Map();
  for (const name of realFiles) {
    const buf = await readFile(path.join(REAL_JSON, name));
    await writeFile(path.join(outputDir, name), buf);
    snapshot.set(name, sha(buf));
  }
  // 非生成物（不应被清理 / 不应被覆盖）。
  const keepName = "README-keep.txt";
  const keepBody = "keep-me-do-not-delete";
  await writeFile(path.join(outputDir, keepName), keepBody);
  snapshot.set(keepName, sha(Buffer.from(keepBody)));
  // 旧版 stale story- 文件（成功路径应被清理；失败路径应保留）。
  const staleName = "story-OLD-STALE.json";
  const staleBody = '{"stale":true}';
  await writeFile(path.join(outputDir, staleName), staleBody);
  snapshot.set(staleName, sha(Buffer.from(staleBody)));
  return snapshot;
}

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// 失败后断言：旧产物全部原封不动（内容与字节一致），暂存目录不存在。
async function assertOldOutputsUntouched(outputDir, snapshot) {
  const files = await readdir(outputDir);
  assert.equal(
    files.length,
    snapshot.size,
    `旧产物数量应不变，实际 ${files.length}，预期 ${snapshot.size}`,
  );
  for (const [name, expectedSha] of snapshot) {
    const buf = await readFile(path.join(outputDir, name));
    assert.equal(
      sha(buf),
      expectedSha,
      `失败路径下旧产物 ${name} 被改动或删除`,
    );
  }
  // 暂存目录残留不应出现在输出目录的父级。
  const parentFiles = await readdir(path.dirname(outputDir));
  const leftover = parentFiles.filter((f) => f.startsWith("export-stage-"));
  assert.deepEqual(leftover, [], "暂存目录不应残留");
}

// 修改时间线副本：把某行的 milestone_id 改成与另一行重复。
async function corruptDuplicateMilestone(rootDir) {
  const file = path.join(rootDir, TIMELINE_REL);
  let body = await readFile(file, "utf8");
  // ms_001 已存在于第一数据行；把 ms_002 行的 ID 改成 ms_001 制造重复。
  body = body.replace("| ms_002 |", "| ms_001 |");
  await writeFile(file, body, "utf8");
}

// 修改时间线副本：把某行的 milestone_id 清空。
async function corruptMissingMilestone(rootDir) {
  const file = path.join(rootDir, TIMELINE_REL);
  let body = await readFile(file, "utf8");
  body = body.replace("| ms_002 |", "|  |");
  await writeFile(file, body, "utf8");
}

// 删除第一个故事配置依赖的事件源文件，使 compileStory 读取失败。
async function corruptMissingStorySource(rootDir) {
  const target = path.join(rootDir, "wiki/sources/前202-项羽乌江自刎-小星星讲述.md");
  await rm(target, { force: true });
}

test("FAIL 路径：重复 milestone_id 不删除/覆盖旧 story/event/timeline 产物", async () => {
  const rootDir = await makeFixtureRoot("dup");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  const snapshot = await seedOldOutputs(outputDir);
  await corruptDuplicateMilestone(rootDir);

  await assert.rejects(
    () => runExport({ rootDir, outputDir }),
    /重复/,
    "重复 milestone_id 应使 buildTimelineMilestones 抛错",
  );
  await assertOldOutputsUntouched(outputDir, snapshot);
  await rm(rootDir, { recursive: true, force: true });
});

test("FAIL 路径：缺失 milestone_id 不删除/覆盖旧产物", async () => {
  const rootDir = await makeFixtureRoot("miss");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  const snapshot = await seedOldOutputs(outputDir);
  await corruptMissingMilestone(rootDir);

  await assert.rejects(
    () => runExport({ rootDir, outputDir }),
    /缺少 milestone_id/,
    "缺失 milestone_id 应使 buildTimelineMilestones 抛错",
  );
  await assertOldOutputsUntouched(outputDir, snapshot);
  await rm(rootDir, { recursive: true, force: true });
});

test("FAIL 路径：compileStory 读取失败不删除/覆盖旧产物", async () => {
  const rootDir = await makeFixtureRoot("cstory");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  const snapshot = await seedOldOutputs(outputDir);
  await corruptMissingStorySource(rootDir);

  await assert.rejects(
    () => runExport({ rootDir, outputDir }),
    // readMarkdownPage 失败经 failWithContext 包装为 export-history-data: ...
    /export-history-data|ENOENT|missing file/i,
    "故事源文件缺失应使 compileStory 抛错",
  );
  await assertOldOutputsUntouched(outputDir, snapshot);
  await rm(rootDir, { recursive: true, force: true });
});

test("SUCCESS 路径：全量输出且旧生成物被清理，非生成物保留", async () => {
  const rootDir = await makeFixtureRoot("ok");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  const snapshot = await seedOldOutputs(outputDir);

  await runExport({ rootDir, outputDir });

  const files = await readdir(outputDir);
  // 17 events + 17 stories + timeline-rail.json = 35
  const events = files.filter((f) => f.startsWith("event_"));
  const stories = files.filter((f) => f.startsWith("story-"));
  assert.equal(events.length, 17, "应输出 17 个 event 文件");
  assert.equal(stories.length, 17, "应输出 17 个 story 文件");
  assert.ok(files.includes("timeline-rail.json"), "应输出 timeline-rail.json");
  // stale story- 旧文件应被清理。
  assert.ok(!files.includes("story-OLD-STALE.json"), "旧 stale story 文件应被清理");
  // 非生成物应保留。
  assert.ok(files.includes("README-keep.txt"), "非生成物应保留");
  // timeline-rail.json 应为本轮写入的有效产物（含 milestones 数组）。
  const newTimeline = JSON.parse(
    await readFile(path.join(outputDir, "timeline-rail.json"), "utf8"),
  );
  assert.ok(
    Array.isArray(newTimeline.milestones) && newTimeline.milestones.length > 0,
    "timeline-rail.json 应为含 milestones 的有效产物",
  );
  await rm(rootDir, { recursive: true, force: true });
});
