import { loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function AiLlmPage() {
  return <VulnListView sources={loadSourceHealth()} category="ai-llm" />;
}
