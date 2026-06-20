import { loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function BackendPage() {
  return <VulnListView sources={loadSourceHealth()} category="backend" />;
}
