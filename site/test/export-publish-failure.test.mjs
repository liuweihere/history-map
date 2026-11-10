// 回归测试：发布阶段文件操作失败时旧产物的数据保全。
//
// 风险背景：runExport 先 clearGeneratedStoryExports（unlink 旧生成物）再
// Promise.all rename 暂存产物。若任一 unlink/rename 出错，旧数据已删除且
// 无备份，造成不可恢复丢失；finally 删除暂存目录还可能与尚未 settle 的
// Promise.all rename 竞态。
//
// 本测试用「完整临时隔离项目副本 + 真实 runExport 入口 + fsOps 注入」在第 N
// 个发布阶段 rename 操作上精确注入失败，验证：所有旧 story/event/timeline
// 产物要么原封不动留在输出目录，要么存在完整可恢复的备份目录；非生成物
// 必须保留；不允许出现「旧产物已删、新产物半写、无备份」的数据丢失态。
//
// 真实生产 wiki/06_Exports/json 不被触碰。

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
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const WIKI_ROOT = path.join(REPO_ROOT, "wiki");
const REAL_JSON = path.join(WIKI_ROOT, "06_Exports/json");

async function makeFixtureRoot(label) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), `hm-pub-${label}-`));
  await cp(path.join(WIKI_ROOT, "wiki"), path.join(rootDir, "wiki"), {
    recursive: true,
  });
  await cp(path.join(WIKI_ROOT, "raw"), path.join(rootDir, "raw"), {
    recursive: true,
  });
  return rootDir;
}

// 预置旧产物：真实生成文件 + 非生成物 + stale story 文件。返回内容快照。
async function seedOldOutputs(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const realFiles = await readdir(REAL_JSON);
  const snapshot = new Map();
  for (const name of realFiles) {
    const buf = await readFile(path.join(REAL_JSON, name));
    await writeFile(path.join(outputDir, name), buf);
    snapshot.set(name, sha(buf));
  }
  const keepName = "README-keep.txt";
  const keepBody = "keep-me-do-not-delete";
  await writeFile(path.join(outputDir, keepName), keepBody);
  snapshot.set(keepName, sha(Buffer.from(keepBody)));
  const staleName = "story-OLD-STALE.json";
  const staleBody = '{"stale":true}';
  await writeFile(path.join(outputDir, staleName), staleBody);
  snapshot.set(staleName, sha(Buffer.from(staleBody)));
  return snapshot;
}

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// 断言：旧生成产物要么原封留在 outputDir，要么存在完整可恢复备份目录。
// 非生成物必须原位保留。不允许数据丢失态。
async function assertOldDataRecoverable(outputDir, snapshot) {
  const parent = path.dirname(outputDir);
  const parentEntries = await readdir(parent);
  const backupDirs = parentEntries.filter((f) => f.startsWith("export-backup-"));

  // 非生成物必须保留。
  const keepBuf = await readFile(path.join(outputDir, "README-keep.txt"));
  assert.equal(
    sha(keepBuf),
    snapshot.get("README-keep.txt"),
    "非生成物 README-keep.txt 必须原位保留",
  );

  // 收集「旧生成产物」的当前可恢复内容：outputDir 中仍在的 + 备份目录中的。
  const outputFiles = await readdir(outputDir);
  const recoveredOld = new Map(); // name -> sha (来自旧产物)
  for (const name of outputFiles) {
    if (
      name.startsWith("event_") ||
      name.startsWith("story-") ||
      name === "timeline-rail.json"
    ) {
      // 此文件可能在 outputDir；判断它是否仍是旧内容需比对快照。
      const buf = await readFile(path.join(outputDir, name));
      const digest = sha(buf);
      if (snapshot.has(name) && digest === snapshot.get(name)) {
        recoveredOld.set(name, digest);
      }
      // 若 sha 不同，说明是新产物覆盖了旧产物——在失败注入路径下，旧产物
      // 必须仍在备份目录里（见下方备份校验）。
    }
  }

  // 汇总备份目录中的旧产物。
  for (const bname of backupDirs) {
    const bdir = path.join(parent, bname);
    const bfiles = await readdir(bdir);
    for (const name of bfiles) {
      const buf = await readFile(path.join(bdir, name));
      const digest = sha(buf);
      if (snapshot.has(name)) {
        assert.equal(
          digest,
          snapshot.get(name),
          `备份目录中的旧产物 ${name} 内容必须与原始一致（可恢复）`,
        );
        recoveredOld.set(name, digest);
      }
    }
  }

  // 所有旧生成产物（event_*/story-*/timeline-rail.json）必须可恢复：
  // 要么原封留在 outputDir，要么完整留在备份目录。
  for (const [name, expectedSha] of snapshot) {
    if (
      name.startsWith("event_") ||
      name.startsWith("story-") ||
      name === "timeline-rail.json"
    ) {
      assert.ok(
        recoveredOld.has(name),
        `旧生成产物 ${name} 既不在 outputDir 也无备份副本 → 数据丢失`,
      );
      assert.equal(
        recoveredOld.get(name),
        expectedSha,
        `旧生成产物 ${name} 可恢复副本内容与原始不一致`,
      );
    }
  }
}

// 构造一个 rename 注入器：在第 failAfter 次调用时抛错（模拟发布阶段第 N 个
// 文件操作失败）。其余调用透传真实 rename。rename 仅在发布阶段使用（编译
// 用 writeFile），因此计数即发布阶段序数。
function makeFailingRename(realRename, failAfter) {
  let calls = 0;
  return async (oldPath, newPath) => {
    calls += 1;
    if (calls === failAfter) {
      throw new Error(
        `injected publish-phase rename failure #${calls}: ${path.basename(newPath)}`,
      );
    }
    return realRename(oldPath, newPath);
  };
}

test("RED→GREEN: 发布阶段第 N 个 rename 失败时旧产物保全或可恢复备份", async () => {
  const rootDir = await makeFixtureRoot("rnfail");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  const snapshot = await seedOldOutputs(outputDir);

  // 真实 fs/promises.rename（注入器透传用）。
  const realRename = (await import("node:fs/promises")).rename;
  // 在第 3 次发布阶段 rename 时失败（备份/搬运中途）。
  const fsOps = { rename: makeFailingRename(realRename, 3) };

  await assert.rejects(
    () => runExport({ rootDir, outputDir, fsOps }),
    /injected publish-phase rename failure|export/i,
    "注入的发布阶段 rename 失败应使 runExport 抛错",
  );

  await assertOldDataRecoverable(outputDir, snapshot);
  await rm(rootDir, { recursive: true, force: true });
});

test("RED→GREEN: 发布阶段首个 rename 失败时旧产物保全或可恢复备份", async () => {
  const rootDir = await makeFixtureRoot("rnfirst");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  const snapshot = await seedOldOutputs(outputDir);

  const realRename = (await import("node:fs/promises")).rename;
  const fsOps = { rename: makeFailingRename(realRename, 1) };

  await assert.rejects(
    () => runExport({ rootDir, outputDir, fsOps }),
    /injected publish-phase rename failure|export/i,
  );

  await assertOldDataRecoverable(outputDir, snapshot);
  await rm(rootDir, { recursive: true, force: true });
});

test("RED→GREEN: 发布阶段靠后 rename 失败时旧产物保全或可恢复备份", async () => {
  const rootDir = await makeFixtureRoot("rnlate");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  const snapshot = await seedOldOutputs(outputDir);

  const realRename = (await import("node:fs/promises")).rename;
  // 第 20 次：发布阶段中后段失败（部分新产物已搬入，旧产物应仍在备份）。
  const fsOps = { rename: makeFailingRename(realRename, 20) };

  await assert.rejects(
    () => runExport({ rootDir, outputDir, fsOps }),
    /injected publish-phase rename failure|export/i,
  );

  await assertOldDataRecoverable(outputDir, snapshot);
  await rm(rootDir, { recursive: true, force: true });
});

test("SUCCESS 路径不受 fsOps 注入影响：全量输出且非生成物保留", async () => {
  const rootDir = await makeFixtureRoot("ok");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  await seedOldOutputs(outputDir);

  // 不注入任何失败（空 fsOps），验证注入机制不破坏成功路径。
  await runExport({ rootDir, outputDir, fsOps: {} });

  const files = await readdir(outputDir);
  const events = files.filter((f) => f.startsWith("event_"));
  const stories = files.filter((f) => f.startsWith("story-"));
  assert.equal(events.length, 17, "应输出 17 个 event 文件");
  assert.equal(stories.length, 17, "应输出 17 个 story 文件");
  assert.ok(files.includes("timeline-rail.json"), "应输出 timeline-rail.json");
  assert.ok(!files.includes("story-OLD-STALE.json"), "旧 stale story 文件应被清理");
  assert.ok(files.includes("README-keep.txt"), "非生成物应保留");
  await rm(rootDir, { recursive: true, force: true });
});
