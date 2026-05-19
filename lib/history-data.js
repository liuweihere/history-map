import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

const dataRoot = path.join(process.cwd(), "public/data/generated");

async function readJsonFile(fileName) {
  const absolutePath = path.join(dataRoot, fileName);
  const content = await readFile(absolutePath, "utf8");
  return JSON.parse(content);
}

export const getChronicleData = cache(async function getChronicleData() {
  const fileNames = await readdir(dataRoot);
  const storyFiles = fileNames.filter((fileName) => fileName.startsWith("story-") && fileName.endsWith(".json")).sort();
  const eventFiles = fileNames.filter((fileName) => fileName.startsWith("event_") && fileName.endsWith(".json")).sort();
  const hasTimelineRail = fileNames.includes("timeline-rail.json");

  const [stories, events, timelineRail] = await Promise.all([
    Promise.all(storyFiles.map((fileName) => readJsonFile(fileName))),
    Promise.all(eventFiles.map((fileName) => readJsonFile(fileName))),
    hasTimelineRail ? readJsonFile("timeline-rail.json") : Promise.resolve({ milestones: [] }),
  ]);

  const eventById = new Map(events.map((event) => [event.id, event]));

  const entries = stories
    .map((story) => {
      const event = eventById.get(story.event.id);
      if (!event) {
        throw new Error(`Missing event export for story ${story.story_id}: ${story.event.id}`);
      }

      return { event, story };
    })
    .sort((a, b) => a.story.timeline.year - b.story.timeline.year);

  return {
    entries,
    timeline: timelineRail,
  };
});
