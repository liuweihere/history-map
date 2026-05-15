import { HistoryAtlasApp } from "../components/history-atlas-app";
import { getChronicleData } from "../lib/history-data";

export default async function HomePage() {
  const entries = await getChronicleData();

  return <HistoryAtlasApp entries={entries} />;
}
