import { loadAllVulns, loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function AiLlmPage() {
  const vulns = loadAllVulns().filter(
    (v) => v.tags.includes('ai-llm') || v.ecosystems.includes('ai-llm'),
  );
  const sources = loadSourceHealth();
  return <VulnListView vulns={vulns} sources={sources} />;
}
