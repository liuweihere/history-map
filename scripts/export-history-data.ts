import { createRequire } from "node:module";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type FrontmatterValue = string | number | boolean | string[] | undefined;

type FrontmatterRecord = Record<string, FrontmatterValue>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);

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
  factions: stringArraySchema.min(1),
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
  geojson_file: z.string().min(1),
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
    }),
  ),
  child_story: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
  }),
  map_plan: z.object({
    id: z.string().min(1),
    display_type: z.string().min(1),
    certainty: z.enum(["high", "medium", "low"]),
  }),
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
  factions: z.array(z.string()).min(1),
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

async function main() {
  const eventPage = await readMarkdownPage("wiki/entities/events/184-黄巾起义.md");
  const childStoryPage = await readMarkdownPage(
    "wiki/synthesis/child-stories/184-黄巾起义-age7.md",
  );
  const parentNotePage = await readMarkdownPage(
    "wiki/synthesis/parent-notes/184-黄巾起义-家长说明.md",
  );
  const mapLayerPage = await readMarkdownPage(
    "wiki/entities/map-layers/184-黄巾起义-地图计划.md",
  );
  const timelinePage = await readMarkdownPage("wiki/synthesis/curriculum/三国形成篇时间线.md");
  const readingNoteSourcePage = await readMarkdownPage("wiki/sources/184-黄巾起义-亲子共读记录.md");
  const childRetellingSourcePage = await readMarkdownPage("wiki/sources/184-黄巾起义-小星星讲述.md");
  const historicalDigestSourcePage = await readMarkdownPage("wiki/sources/184-黄巾起义-史料提要.md");

  const event = eventFrontmatterSchema.parse(eventPage.frontmatter);
  const childStory = childStoryFrontmatterSchema.parse(childStoryPage.frontmatter);
  const parentNote = parentNoteFrontmatterSchema.parse(parentNotePage.frontmatter);
  const mapLayer = mapLayerFrontmatterSchema.parse(mapLayerPage.frontmatter);
  const sourcePages = stableOrder(
    [
      sourceFrontmatterSchema.parse(readingNoteSourcePage.frontmatter),
      sourceFrontmatterSchema.parse(childRetellingSourcePage.frontmatter),
      sourceFrontmatterSchema.parse(historicalDigestSourcePage.frontmatter),
    ],
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
  }

  for (const sourcePageId of sourcePageIds) {
    if (!childStory.source_refs.includes(sourcePageId)) {
      throw new Error(`Child story source_refs is missing canonical source page ${sourcePageId}.`);
    }
    if (!parentNote.source_refs.includes(sourcePageId)) {
      throw new Error(`Parent note source_refs is missing canonical source page ${sourcePageId}.`);
    }
  }

  for (const requiredSourceId of [
    "source_yellow_turban_historical_digest",
    "source_yellow_turban_reading_note",
  ]) {
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

  const timelineRows = parseMarkdownTable(timelinePage.body);
  const timelineRow = timelineRows.find((row) => row["年份"] === String(event.year));
  if (!timelineRow) {
    throw new Error(`Timeline is missing year ${event.year}.`);
  }

  const personPages = await Promise.all(
    event.people.map(async (personId: string) => {
      const fileName =
        personId === "person_zhang_jue"
          ? "wiki/entities/people/张角.md"
          : (() => {
              throw new Error(`No file mapping configured for person ${personId}.`);
            })();
      return readMarkdownPage(fileName);
    }),
  );
  const factionPages = await Promise.all(
    event.factions.map(async (factionId: string) => {
      const fileName =
        factionId === "faction_eastern_han"
          ? "wiki/entities/factions/东汉.md"
          : factionId === "faction_yellow_turban"
            ? "wiki/entities/factions/黄巾军.md"
            : (() => {
                throw new Error(`No file mapping configured for faction ${factionId}.`);
              })();
      return readMarkdownPage(fileName);
    }),
  );
  const placePages = await Promise.all(
    event.places.map(async (placeId: string) => {
      const fileName =
        placeId === "place_luoyang"
          ? "wiki/entities/places/洛阳.md"
          : placeId === "place_julu"
            ? "wiki/entities/places/钜鹿.md"
            : (() => {
                throw new Error(`No file mapping configured for place ${placeId}.`);
              })();
      return readMarkdownPage(fileName);
    }),
  );

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
    story_id: "story_001_yellow_turban",
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
    })),
    child_story: {
      id: childStory.id,
      title: childStoryPage.body
        .split("\n")
        .find((line) => line.startsWith("# "))
        ?.replace(/^#\s+/, "")
        .trim() ?? childStory.title,
    },
    map_plan: {
      id: mapLayer.id,
      display_type: mapLayer.display_type,
      certainty: mapLayer.certainty,
    },
  });

  const outputDir = path.join(ROOT, "06_Exports/json");
  await mkdir(outputDir, { recursive: true });

  await writeFile(
    path.join(outputDir, "event_yellow_turban_184.json"),
    `${JSON.stringify(eventJson, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outputDir, "story-001-yellow-turban.json"),
    `${JSON.stringify(storyJson, null, 2)}\n`,
    "utf8",
  );

  console.log("Exported Story 001 history JSON successfully.");
}

main().catch((error) => failWithContext("export-history-data", error));
