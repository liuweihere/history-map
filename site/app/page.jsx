import { HistoryAtlasApp } from "../components/history-atlas-app";
import { getChronicleData } from "../lib/history-data";

export default async function HomePage() {
  const { entries, timeline } = await getChronicleData();

  return <HistoryAtlasApp entries={entries} timeline={timeline} />;
}
