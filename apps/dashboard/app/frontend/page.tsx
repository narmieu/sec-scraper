import { loadAllVulns } from '../../lib/data';
import { VulnListView } from '../../components/VulnListView';

export default function FrontendPage() {
  const vulns = loadAllVulns().filter(
    (v) => v.ecosystems.includes('npm') || v.tags.includes('frontend') || v.tags.includes('nextjs'),
  );
  return <VulnListView vulns={vulns} />;
}
