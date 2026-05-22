import { loadAllVulns } from '../lib/data';
import { VulnListView } from '../components/VulnListView';

export default function HomePage() {
  const vulns = loadAllVulns();
  return <VulnListView vulns={vulns} />;
}
