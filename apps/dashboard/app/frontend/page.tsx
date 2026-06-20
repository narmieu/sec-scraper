import { loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function FrontendPage() {
  return <VulnListView sources={loadSourceHealth()} category="frontend" />;
}
