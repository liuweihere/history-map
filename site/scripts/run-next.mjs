import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const mode = process.argv[2];
const passthroughArgs = process.argv.slice(3);

if (!["dev", "build", "start"].includes(mode)) {
  console.error("Usage: node scripts/run-next.mjs <dev|build|start> [...next-args]");
  process.exit(1);
}

const shouldSyncData = mode === "dev" || mode === "build";
const shouldClearCache = mode === "dev" || mode === "build";

if (shouldSyncData) {
  const syncResult = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "sync-history-data.mjs")], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (syncResult.status !== 0) {
    process.exit(syncResult.status ?? 1);
  }
}

if (shouldClearCache) {
  rmSync(path.join(projectRoot, ".next"), { recursive: true, force: true });
}

const nextEnv = { ...process.env };
delete nextEnv.NODE_ENV;

const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const nextResult = spawnSync(process.execPath, [nextBin, mode, ...passthroughArgs], {
  cwd: projectRoot,
  stdio: "inherit",
  env: nextEnv,
});

process.exit(nextResult.status ?? 1);
