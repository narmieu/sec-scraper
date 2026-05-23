import { loadAllVulns, loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function FrontendPage() {
  const vulns = loadAllVulns().filter(
    (v) => v.ecosystems.includes('npm') || v.tags.includes('frontend') || v.tags.includes('nextjs'),
  );
  const sources = loadSourceHealth();
  return <VulnListView vulns={vulns} sources={sources} />;
}
