import { loadAllVulns } from '../../lib/data';
import { VulnListView } from '../../components/VulnListView';

export default function BackendPage() {
  const vulns = loadAllVulns().filter(
    (v) =>
      v.ecosystems.includes('composer') || v.tags.includes('backend') || v.tags.includes('symfony'),
  );
  return <VulnListView vulns={vulns} />;
}
