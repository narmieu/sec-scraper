import { loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function HomePage() {
  return <VulnListView sources={loadSourceHealth()} />;
}
