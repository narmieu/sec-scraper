import { loadAllVulns } from '../../lib/data';
import { VulnListView } from '../../components/VulnListView';

export default function AiLlmPage() {
  const vulns = loadAllVulns().filter(
    (v) => v.tags.includes('ai-llm') || v.ecosystems.includes('ai-llm'),
  );
  return <VulnListView vulns={vulns} />;
}
