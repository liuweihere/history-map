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
  open as realOpen,
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

// 注入 open：仅对 lockPath 的 'wx' 创建先屏障对齐再真实 open（原子排他创建）；
// 其余路径透传真实 open。
// acquireExportLock 已改用 open('wx') 原子创建，屏障必须注入 open（而非旧
// writeFile）才能在真实创建窗口前严格对齐两方，确定性复现 open('wx') 竞争。
function makeBarrierOpen(realOpenFn, lockPath, barrier) {
  return async (file, flags, ...rest) => {
    if (
      flags === "wx" &&
      path.resolve(String(file)) === path.resolve(lockPath)
    ) {
      await barrier.arrive();
    }
    return realOpenFn(file, flags, ...rest);
  };
}

test("RED→GREEN: 两个真实 runExport 同目标并发，仅一个获得锁所有权", async () => {
  const rootDir = await makeFixtureRoot("race");
  const outputDir = path.join(rootDir, "06_Exports/json-race-out");
  await seedOldOutputs(outputDir);
  const lockPath = path.join(path.dirname(outputDir), ".export-lock");
  const barrier = makeTwoPartyBarrier();
  const fsOps = { open: makeBarrierOpen(realOpen, lockPath, barrier) };

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

// ===== 故障注入：open('wx') 成功后 writeFile/close 抛错的残留清理 =====
//
// acquireExportLock 改用 open('wx') 后，open 创建成功但后续 handle.writeFile
// 或 handle.close 抛错时，错误传播到 runExport 但 lockHeld 未设（acquireExportLock
// 抛错在 lockHeld = true 之前），finally 不释放锁 → 空锁/半成品锁残留，所有
// 后续导出永久 fail-closed。修复：acquireExportLock 在 open 成功后若 write/close
// 失败，清理自有残留（验证内容为空或匹配 ownerTag 才 unlink），使后续导出可恢复。

// 包装真实 open 返回的 FileHandle：仅覆盖 writeFile/close，其余透传。
// acquireExportLock 只调用 handle.writeFile 和 handle.close，故只需提供这两个方法。
function wrapHandle(realHandle, overrides) {
  return {
    writeFile: (data, ...args) => realHandle.writeFile(data, ...args),
    close: () => realHandle.close(),
    ...overrides,
  };
}

// 注入 open：对 lockPath 的 'wx' 返回包装 handle，writeFile 抛错（复现写入失败）。
function makeWriteFailOpen(lockPath) {
  const lp = path.resolve(lockPath);
  return async (file, flags, ...rest) => {
    const handle = await realOpen(file, flags, ...rest);
    if (flags === "wx" && path.resolve(String(file)) === lp) {
      return wrapHandle(handle, {
        writeFile: async () => {
          throw new Error("injected writeFile failure");
        },
      });
    }
    return handle;
  };
}

// 注入 open：对 lockPath 的 'wx' 返回包装 handle，close 抛错（复现关闭失败）。
function makeCloseFailOpen(lockPath) {
  const lp = path.resolve(lockPath);
  return async (file, flags, ...rest) => {
    const handle = await realOpen(file, flags, ...rest);
    if (flags === "wx" && path.resolve(String(file)) === lp) {
      return wrapHandle(handle, {
        close: async () => {
          // 仍关闭真实 fd 避免泄漏，然后抛注入错误（模拟 close 失败）。
          try { await handle.close(); } catch {}
          throw new Error("injected close failure");
        },
      });
    }
    return handle;
  };
}

test("故障注入：open 成功后 writeFile 抛错 → 清理残留锁，后续导出可恢复", async () => {
  const rootDir = await makeFixtureRoot("wf-fail");
  const outputDir = path.join(rootDir, "06_Exports/json-wf-fail-out");
  await seedOldOutputs(outputDir);
  const lockPath = path.join(path.dirname(outputDir), ".export-lock");
  const fsOps = { open: makeWriteFailOpen(lockPath) };

  try {
    await assert.rejects(
      () => runExport({ rootDir, outputDir, fsOps }),
      /injected writeFile failure|写入.*失败|残留/,
      "writeFile 失败应抛错",
    );

    // 残留锁应被清理（open 创建了空文件，writeFile 未写入任何内容）。
    await assert.rejects(
      () => readFile(lockPath, "utf8"),
      /ENOENT/,
      "writeFile 失败后残留锁应被清理，不应永久阻塞后续导出",
    );

    // 后续导出应可正常恢复（锁已清理）。
    await runExport({ rootDir, outputDir });
    const files = await readdir(outputDir);
    assert.equal(
      files.filter((f) => f.startsWith("event_")).length,
      17,
      "恢复后应输出 17 个 event",
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("故障注入：open 成功后 close 抛错 → 清理残留锁，后续导出可恢复", async () => {
  const rootDir = await makeFixtureRoot("cl-fail");
  const outputDir = path.join(rootDir, "06_Exports/json-cl-fail-out");
  await seedOldOutputs(outputDir);
  const lockPath = path.join(path.dirname(outputDir), ".export-lock");
  const fsOps = { open: makeCloseFailOpen(lockPath) };

  try {
    await assert.rejects(
      () => runExport({ rootDir, outputDir, fsOps }),
      /injected close failure|关闭.*失败|残留/,
      "close 失败应抛错",
    );

    // 残留锁应被清理（writeFile 成功写入 ownerTag，close 失败 → 内容匹配 ownerTag）。
    await assert.rejects(
      () => readFile(lockPath, "utf8"),
      /ENOENT/,
      "close 失败后残留锁应被清理（内容匹配 ownerTag），不应永久阻塞后续导出",
    );

    // 后续导出应可正常恢复。
    await runExport({ rootDir, outputDir });
    const files = await readdir(outputDir);
    assert.equal(
      files.filter((f) => f.startsWith("event_")).length,
      17,
      "恢复后应输出 17 个 event",
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("故障注入：清理残留时不删除他人锁（所有权不明确 → fail-closed）", async () => {
  const rootDir = await makeFixtureRoot("oth-race");
  const outputDir = path.join(rootDir, "06_Exports/json-oth-race-out");
  await seedOldOutputs(outputDir);
  const lockPath = path.join(path.dirname(outputDir), ".export-lock");
  const otherOwner = "77777\n2026-01-01T00:00:00.000Z\n/other/staging";
  const lp = path.resolve(lockPath);

  // 注入 open：对 lockPath 的 'wx' 返回包装 handle，writeFile 在抛错前
  // 先用他人 ownerTag 覆写锁文件（模拟手动删除+他人重建的竞争窗口）。
  const fsOps = {
    open: async (file, flags, ...rest) => {
      const handle = await realOpen(file, flags, ...rest);
      if (flags === "wx" && path.resolve(String(file)) === lp) {
        return wrapHandle(handle, {
          writeFile: async () => {
            // 模拟竞争：他人删除我们的空锁并创建了自己的锁。
            await writeFile(lockPath, otherOwner, "utf8");
            throw new Error("injected writeFile failure with race");
          },
        });
      }
      return handle;
    },
  };

  try {
    await assert.rejects(
      () => runExport({ rootDir, outputDir, fsOps }),
      /injected writeFile failure with race|写入.*失败|残留/,
      "writeFile 失败应抛错",
    );

    // 他人锁不应被清理（内容不匹配本进程 ownerTag，所有权不明确 → 不 unlink）。
    const after = await readFile(lockPath, "utf8");
    assert.equal(
      after,
      otherOwner,
      "所有权不明确时不得 unlink 他人锁（fail-closed 保留）",
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ===== EEXIST→ENOENT 有界重试（杜绝无界递归）=====

test("EEXIST→ENOENT 反复时有限重试后 fail-closed，不无界递归", async () => {
  const rootDir = await makeFixtureRoot("eexist-loop");
  const outputDir = path.join(rootDir, "06_Exports/json-eexist-loop-out");
  await seedOldOutputs(outputDir);
  const lockPath = path.join(path.dirname(outputDir), ".export-lock");
  const lp = path.resolve(lockPath);
  const realReadFile = (await import("node:fs/promises")).readFile;

  // open 始终抛 EEXIST（锁"已存在"），readFile 始终抛 ENOENT（锁"已消失"）。
  // 修复前：无界递归 → 挂起/栈溢出。修复后：有限重试后抛诊断错误。
  let openCalls = 0;
  const fsOps = {
    open: async (file, flags, ...rest) => {
      if (flags === "wx" && path.resolve(String(file)) === lp) {
        openCalls += 1;
        const err = new Error("EEXIST injected");
        err.code = "EEXIST";
        throw err;
      }
      return realOpen(file, flags, ...rest);
    },
    readFile: async (file, ...args) => {
      if (path.resolve(String(file)) === lp) {
        const err = new Error("ENOENT injected");
        err.code = "ENOENT";
        throw err;
      }
      return realReadFile(file, ...args);
    },
  };

  try {
    // 用 Promise.race 防止无界递归挂起整个测试进程。
    const result = await Promise.race([
      runExport({ rootDir, outputDir, fsOps }).then(
        () => "fulfilled",
        (e) => `rejected: ${e instanceof Error ? e.message : String(e)}`,
      ),
      new Promise((resolve) =>
        setTimeout(() => resolve("TIMEOUT"), 5000),
      ),
    ]);

    assert.notEqual(result, "TIMEOUT", "不应无界递归挂起");
    assert.ok(
      result.startsWith("rejected"),
      `应 fail-closed 拒绝，实际：${result}`,
    );
    assert.ok(
      openCalls <= 10,
      `重试次数应有界（≤10），实际 open 调用 ${openCalls} 次`,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
