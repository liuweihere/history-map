import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

const dataRoot = path.join(process.cwd(), "public/data/generated");

async function readJsonFile(fileName) {
  const absolutePath = path.join(dataRoot, fileName);
  const content = await readFile(absolutePath, "utf8");
  return JSON.parse(content);
}

export const getStory001Data = cache(async function getStory001Data() {
  const [event, story] = await Promise.all([
    readJsonFile("event_yellow_turban_184.json"),
    readJsonFile("story-001-yellow-turban.json"),
  ]);

  return { event, story };
});

export const getChronicleData = cache(async function getChronicleData() {
  const [story001Event, story001, story002Event, story002] = await Promise.all([
    readJsonFile("event_yellow_turban_184.json"),
    readJsonFile("story-001-yellow-turban.json"),
    readJsonFile("event_dong_zhuo_entry_190.json"),
    readJsonFile("story-002-dong-zhuo-entry.json"),
  ]);

  return [
    { event: story001Event, story: story001 },
    { event: story002Event, story: story002 },
  ];
});
