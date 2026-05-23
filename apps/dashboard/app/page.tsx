import { loadAllVulns, loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function HomePage() {
  const vulns = loadAllVulns();
  const sources = loadSourceHealth();
  return <VulnListView vulns={vulns} sources={sources} />;
}
