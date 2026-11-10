// 回归测试：同目标并发导出锁（fail-closed，不删他人锁）。
//
// 验收：
//   - 锁已存在时，第二次 runExport fail-closed（抛错，不发布、不删除锁）；
//   - 锁内容不属于本进程时，releaseExportLock 不删除他人锁；
//   - 成功导出后锁被释放（下次可正常导出）；
//   - 非生成物在并发拒绝路径下原位保留。
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
import path from "node:path";
import os from "node:os";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const WIKI_ROOT = path.join(REPO_ROOT, "wiki");
const REAL_JSON = path.join(WIKI_ROOT, "06_Exports/json");

async function makeFixtureRoot(label) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), `hm-lock-${label}-`));
  await cp(path.join(WIKI_ROOT, "wiki"), path.join(rootDir, "wiki"), {
    recursive: true,
  });
  await cp(path.join(WIKI_ROOT, "raw"), path.join(rootDir, "raw"), {
    recursive: true,
  });
  return rootDir;
}

async function seedOldOutputs(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const realFiles = await readdir(REAL_JSON);
  for (const name of realFiles) {
    const { readFile: rf, writeFile: wf } = await import("node:fs/promises");
    await writeFile(path.join(outputDir, name), await rf(path.join(REAL_JSON, name)));
  }
  await writeFile(path.join(outputDir, "README-keep.txt"), "keep-me");
}

test("并发锁：锁已存在时 fail-closed，不发布、不删除他人锁", async () => {
  const rootDir = await makeFixtureRoot("held");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  await seedOldOutputs(outputDir);
  const lockPath = path.join(path.dirname(outputDir), ".export-lock");
  // 预置他人锁。
  const otherOwner = "99999\n2026-01-01T00:00:00.000Z\n/other/staging";
  await writeFile(lockPath, otherOwner, "utf8");

  await assert.rejects(
    () => runExport({ rootDir, outputDir }),
    /导出锁已存在|fail-closed|并发/,
    "锁已存在应 fail-closed 抛错",
  );

  // 锁不应被删除/覆盖（仍为他人锁内容）。
  const after = await readFile(lockPath, "utf8");
  assert.equal(after, otherOwner, "并发拒绝路径不应删除或覆盖他人锁");
  // 非生成物应原位保留。
  const files = await readdir(outputDir);
  assert.ok(files.includes("README-keep.txt"), "并发拒绝路径非生成物应保留");
  await rm(rootDir, { recursive: true, force: true });
});

test("并发锁：成功导出后锁被释放，可再次导出", async () => {
  const rootDir = await makeFixtureRoot("release");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  await seedOldOutputs(outputDir);
  const lockPath = path.join(path.dirname(outputDir), ".export-lock");

  await runExport({ rootDir, outputDir });
  // 锁应已释放。
  await assert.rejects(
    () => readFile(lockPath, "utf8"),
    /ENOENT/,
    "成功导出后锁文件应已删除",
  );
  // 再次导出应成功（锁可用）。
  await runExport({ rootDir, outputDir });
  await rm(rootDir, { recursive: true, force: true });
});

test("并发锁：发布失败但回滚完整后锁释放（允许重试）", async () => {
  const rootDir = await makeFixtureRoot("retry");
  const outputDir = path.join(rootDir, "06_Exports/json-tmp-out");
  await seedOldOutputs(outputDir);
  const lockPath = path.join(path.dirname(outputDir), ".export-lock");

  const realRename = (await import("node:fs/promises")).rename;
  let calls = 0;
  const fsOps = {
    rename: async (oldPath, newPath) => {
      calls += 1;
      if (calls === 3) throw new Error("injected retry failure #3");
      return realRename(oldPath, newPath);
    },
  };

  await assert.rejects(
    () => runExport({ rootDir, outputDir, fsOps }),
    /injected retry failure/,
    "注入失败应抛错",
  );
  // 回滚完整→锁应释放，允许重试。
  await assert.rejects(
    () => readFile(lockPath, "utf8"),
    /ENOENT/,
    "回滚完整后锁应释放",
  );
  // 重试应成功。
  await runExport({ rootDir, outputDir });
  const files = await readdir(outputDir);
  assert.equal(files.filter((f) => f.startsWith("event_")).length, 17);
  await rm(rootDir, { recursive: true, force: true });
});
