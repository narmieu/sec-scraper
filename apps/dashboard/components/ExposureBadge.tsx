import type { Exposure } from '@sec/shared';
import {
  IconAlertTriangle,
  IconHelpCircle,
  IconShieldCheck,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { StatusBadge } from './StatusBadge';

type ExposureStatus = 'affected' | 'potential' | 'safe';

const LABELS: Record<ExposureStatus, string> = {
  affected: 'Affected',
  potential: 'Potential',
  safe: 'Safe',
};

const ICONS: Record<ExposureStatus, ComponentType<{ className?: string }>> = {
  affected: IconAlertTriangle,
  potential: IconHelpCircle,
  safe: IconShieldCheck,
};

export function ExposureBadge({ exposure }: { exposure?: Exposure }) {
  const status = exposure?.status;
  if (!status || status === 'unknown') return null;
  const patch =
    status === 'affected' && exposure?.fixedIn
      ? ` · patch ${exposure.fixedIn}`
      : '';
  const title = exposure?.package
    ? `${exposure.package} ${exposure.installed ?? ''}`.trim()
    : undefined;
  return (
    <StatusBadge
      variant={`exposure-${status}`}
      icon={ICONS[status]}
      title={title}
    >
      {LABELS[status]}
      {patch}
    </StatusBadge>
  );
}
