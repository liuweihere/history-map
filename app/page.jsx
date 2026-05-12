import { HistoryAtlasApp } from "../components/history-atlas-app";
import { getStory001Data } from "../lib/history-data";

export default async function HomePage() {
  const { event, story } = await getStory001Data();

  return <HistoryAtlasApp event={event} story={story} />;
}

