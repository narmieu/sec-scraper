#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScrape } from './main.js';
import { runAlertTest } from './notify/dispatch.js';

interface CliArgs {
  dryRun: boolean;
  noNotify: boolean;
  alertTest: boolean;
  source?: string;
  dataRoot: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    noNotify: false,
    alertTest: false,
    dataRoot: resolveDefaultDataRoot(),
  };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-notify') args.noNotify = true;
    else if (a === '--alert-test') args.alertTest = true;
    else if (a.startsWith('--source=')) args.source = a.slice('--source='.length);
    else if (a.startsWith('--data=')) args.dataRoot = resolve(a.slice('--data='.length));
  }
  return args;
}

function resolveDefaultDataRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', 'data');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.alertTest) {
    const result = await runAlertTest(args.dataRoot, args.dryRun);
    console.warn(`alert-test: dispatched=${result.dispatched} dryRun=${args.dryRun}`);
    return;
  }

  const report = await runScrape({
    dryRun: args.dryRun,
    noNotify: args.noNotify,
    ...(args.source ? { onlySource: args.source } : {}),
    dataRoot: args.dataRoot,
  });

  console.warn(
    `scrape: new=${report.newCount} updated=${report.updatedCount} archived=${report.archivedCount} dropped=${report.droppedCount} alerts=${report.alertCount} duration=${report.durationMs}ms`,
  );
  if (report.errors.length > 0) {
    console.warn(`errors: ${report.errors.length}`);
    for (const e of report.errors) console.warn(` - ${e.source}/${e.phase}: ${e.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
