import { copyFile, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const wikiRoot = path.resolve(root, "../little-star-history-wiki");
const wikiJsonRoot = path.join(wikiRoot, "06_Exports/json");
const siteJsonRoot = path.join(root, "public/data/generated");

function isHistoryExport(fileName) {
  return (
    (fileName.startsWith("event_") || fileName.startsWith("story-") || fileName === "timeline-rail.json") &&
    fileName.endsWith(".json")
  );
}

async function ensureReadable(filePath) {
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Missing source export: ${filePath}\nRun the wiki exporter first.`);
  }
}

async function clearSiteExports() {
  await mkdir(siteJsonRoot, { recursive: true });
  const existingFiles = await readdir(siteJsonRoot);

  await Promise.all(
    existingFiles
      .filter((fileName) => isHistoryExport(fileName))
      .map((fileName) => unlink(path.join(siteJsonRoot, fileName))),
  );
}

async function main() {
  await clearSiteExports();

  const files = (await readdir(wikiJsonRoot)).filter((fileName) => isHistoryExport(fileName)).sort();

  for (const file of files) {
    const from = path.join(wikiJsonRoot, file);
    const to = path.join(siteJsonRoot, file);
    await ensureReadable(from);
    await copyFile(from, to);
  }

  console.log(`Synced ${files.length} history export file(s) into public/data/generated.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
