import type { Severity } from '@sec/shared';
import { StatusBadge } from './StatusBadge';

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <StatusBadge variant={`severity-${severity}`}>
      {severity}
    </StatusBadge>
  );
}
