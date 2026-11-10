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

// ===== 新增：真实并发 TOCTOU 复现 + 原子互斥验证（RED→GREEN）=====
//
// acquireExportLock 历史实现为 readFile（check）→ writeFile（act）的非原子
// check-then-write。两个真实 runExport 并发同目标时，双方都能在对方写入前读到
// ENOENT，继而各自 writeFile 建锁，双双获得「所有权」，互斥被击穿。下方用
// 两方同步屏障让两个真实 runExport 在创建锁的窗口前严格对齐，确定性复现该
// TOCTOU 竞态，并断言「最终只能一个获得所有权」。修复前（非原子）→ RED；
// 改用 open('wx') 原子排他创建后 → GREEN。

// 两方同步屏障：双方都 arrive 后才同时放行。
function makeTwoPartyBarrier() {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return {
    async arrive() {
      arrived += 1;
      if (arrived >= 2) release();
      await gate;
    },
  };
}

// 注入 writeFile：仅对 lockPath 先屏障对齐再写（默认 'w' 非原子，复现竞态）；
// 其余路径透传真实 writeFile。
// 修复后 acquireExportLock 改用 open('wx') 原子创建、不再调用 writeFile 建锁，
// 此注入对修复后代码无副作用（writeFile 在发布阶段仅被旧 acquireExportLock 使用）。
function makeBarrierWriteFile(realWriteFile, lockPath, barrier) {
  return async (file, data, ...rest) => {
    if (path.resolve(String(file)) === path.resolve(lockPath)) {
      await barrier.arrive();
    }
    return realWriteFile(file, data, ...rest);
  };
}

test("RED→GREEN: 两个真实 runExport 同目标并发，仅一个获得锁所有权", async () => {
  const rootDir = await makeFixtureRoot("race");
  const outputDir = path.join(rootDir, "06_Exports/json-race-out");
  await seedOldOutputs(outputDir);
  const lockPath = path.join(path.dirname(outputDir), ".export-lock");
  const barrier = makeTwoPartyBarrier();
  const realWriteFile = (await import("node:fs/promises")).writeFile;
  const fsOps = { writeFile: makeBarrierWriteFile(realWriteFile, lockPath, barrier) };

  try {
    const results = await Promise.allSettled([
      runExport({ rootDir, outputDir, fsOps }),
      runExport({ rootDir, outputDir, fsOps }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    const lockRejected = rejected.filter((r) =>
      /导出锁已存在|fail-closed|并发/.test(
        String(r.reason?.message ?? r.reason),
      ),
    );

    assert.equal(
      fulfilled.length,
      1,
      `应恰有一个 runExport 成功，实际 ${fulfilled.length}（非原子锁被双方穿透）`,
    );
    assert.equal(
      lockRejected.length,
      1,
      `应恰有一个被并发锁 fail-closed 拒绝，实际 ${lockRejected.length}`,
    );

    // 锁最终应被持有者释放（无残留）。
    await assert.rejects(
      () => readFile(lockPath, "utf8"),
      /ENOENT/,
      "成功者应释放锁，无残留锁文件",
    );
    // 输出目录应有完整产物（成功者发布）。
    const files = await readdir(outputDir);
    assert.equal(
      files.filter((f) => f.startsWith("event_")).length,
      17,
      "成功者应输出 17 个 event",
    );
    assert.ok(files.includes("timeline-rail.json"), "成功者应输出 timeline-rail.json");
    assert.ok(files.includes("README-keep.txt"), "非生成物应保留");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("不同目标锁相互独立：两个不同父级输出目录并发导出互不阻塞", async () => {
  const rootDir = await makeFixtureRoot("indep");
  // 不同父级 → 不同 lockPath，互不竞争。
  const outputDirA = path.join(rootDir, "06_Exports-a/json");
  const outputDirB = path.join(rootDir, "06_Exports-b/json");
  await seedOldOutputs(outputDirA);
  await seedOldOutputs(outputDirB);

  try {
    const results = await Promise.allSettled([
      runExport({ rootDir, outputDir: outputDirA }),
      runExport({ rootDir, outputDir: outputDirB }),
    ]);

    assert.equal(results[0].status, "fulfilled", "A 应成功（独立锁）");
    assert.equal(results[1].status, "fulfilled", "B 应成功（独立锁）");

    // 两锁均应各自释放。
    for (const od of [outputDirA, outputDirB]) {
      await assert.rejects(
        () => readFile(path.join(path.dirname(od), ".export-lock"), "utf8"),
        /ENOENT/,
        "独立目标的锁应各自释放",
      );
    }
    // 两个输出目录均应有完整产物。
    for (const od of [outputDirA, outputDirB]) {
      const files = await readdir(od);
      assert.equal(
        files.filter((f) => f.startsWith("event_")).length,
        17,
        `${od} 应输出 17 个 event`,
      );
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("发布失败不错误删除不同目标的他人锁", async () => {
  const rootDir = await makeFixtureRoot("othlock");
  const outputDir = path.join(rootDir, "06_Exports/json-oth-out");
  await seedOldOutputs(outputDir);
  // 预置一个不同目标（不同父级）的他人锁。
  const otherParent = path.join(rootDir, "06_Exports-other");
  await mkdir(otherParent, { recursive: true });
  const otherLockPath = path.join(otherParent, ".export-lock");
  const otherOwner = "88888\n2026-01-01T00:00:00.000Z\n/other/staging";
  await writeFile(otherLockPath, otherOwner, "utf8");

  const realRename = (await import("node:fs/promises")).rename;
  let calls = 0;
  const fsOps = {
    rename: async (oldPath, newPath) => {
      calls += 1;
      if (calls === 3) throw new Error("injected other-lock failure #3");
      return realRename(oldPath, newPath);
    },
  };

  try {
    await assert.rejects(
      () => runExport({ rootDir, outputDir, fsOps }),
      /injected other-lock failure/,
      "注入失败应抛错",
    );

    // 本目标锁：回滚完整 → 应释放（允许重试）。
    await assert.rejects(
      () => readFile(path.join(path.dirname(outputDir), ".export-lock"), "utf8"),
      /ENOENT/,
      "本目标回滚完整后锁应释放",
    );
    // 不同目标的他人锁：必须原封不动，未被误删/覆盖。
    const otherAfter = await readFile(otherLockPath, "utf8");
    assert.equal(
      otherAfter,
      otherOwner,
      "发布失败不得删除或覆盖不同目标的他人锁",
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
