import path from 'node:path';

import * as style from '../../shared/kernel/style.ts';
import type { FileStatus } from '../../shared/kernel/style.ts';

import type { InstallReport, InstalledFile } from './installer.ts';
import type { Scope, Target } from './targets.ts';

const STATUS_ORDER: readonly FileStatus[] = ['new', 'updated', 'skipped', 'failed'];

export interface ReportOptions {
  readonly verbose: boolean;
  readonly quiet: boolean;
}

function countByStatus(files: readonly InstalledFile[]): Record<FileStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<FileStatus, number>;
  for (const f of files) counts[f.status] += 1;
  return counts;
}

export function displayPath(dest: string, destRoot: string): string {
  const rel = path.relative(destRoot, dest);
  if (rel === '' || rel.startsWith('..') || rel.startsWith('/')) return dest;
  return rel;
}

export function displayPathForReport(
  dest: string,
  destRoot: string,
  skillsDestRoot?: string,
): string {
  const underAgents = displayPath(dest, destRoot);
  if (underAgents !== dest) return underAgents;
  if (skillsDestRoot === undefined) return dest;
  return displayPath(dest, skillsDestRoot);
}

export function formatStatusCounts(counts: Record<FileStatus, number>): readonly string[] {
  return STATUS_ORDER.filter((s) => counts[s] > 0).map(
    (s) => `  ${style.status(s, `${String(counts[s])} ${s}`)}`,
  );
}

export function formatFileLines(
  files: readonly InstalledFile[],
  destRoot: string,
  skillsDestRoot?: string,
): readonly string[] {
  return files.map((f) => {
    const path = displayPathForReport(f.dest, destRoot, skillsDestRoot);
    return `  ${style.status(f.status, f.status.padEnd(7))}  ${path}`;
  });
}

export function formatTargetBody(report: InstallReport, verbose: boolean): readonly string[] {
  const counts = countByStatus(report.files);
  const lines = [...formatStatusCounts(counts)];
  if (verbose) lines.push(...formatFileLines(report.files, report.destRoot, report.skillsDestRoot));
  return lines;
}

export function formatArtifactBody(
  dest: string,
  status: FileStatus,
  verbose: boolean,
): readonly string[] {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, s === status ? 1 : 0])) as Record<
    FileStatus,
    number
  >;
  const lines = [...formatStatusCounts(counts)];
  if (verbose) {
    lines.push(`  ${style.status(status, status.padEnd(7))}  ${dest}`);
  }
  return lines;
}

export function formatArtifactsBody(
  files: readonly InstalledFile[],
  verbose: boolean,
): readonly string[] {
  return files.flatMap((file) => formatArtifactBody(file.dest, file.status, verbose));
}

export function printOpening(version: string, scope: Scope, dir: string): void {
  console.log(style.muted(`swarmroom v${version}`));
  if (scope === 'global') {
    console.log('scope: global');
  } else {
    console.log(`scope: project (${dir})`);
  }
}

export function printTargetReport(report: InstallReport, options: ReportOptions): void {
  if (options.quiet) return;
  const split = report.skillsDestRoot !== undefined && report.skillsDestRoot !== report.destRoot;
  const header = split
    ? `\n${report.target.label} → ${report.destRoot} + ${report.skillsDestRoot}`
    : `\n${report.target.label} → ${report.destRoot}`;
  console.log(header);
  for (const line of formatTargetBody(report, options.verbose)) {
    console.log(line);
  }
}

export function printArtifactReport(
  label: string,
  dest: string,
  status: FileStatus,
  options: ReportOptions,
): void {
  if (options.quiet) return;
  console.log(`\n${label} → ${dest}`);
  for (const line of formatArtifactBody(dest, status, options.verbose)) {
    console.log(line);
  }
}

export function printPiReport(
  root: string,
  files: readonly InstalledFile[],
  options: ReportOptions,
): void {
  if (options.quiet) return;
  console.log(`\nPi → ${root}`);
  for (const line of formatFileLines(files, root)) {
    console.log(line);
  }
}

export function printClosing(chosen: readonly Target[], pi = false): void {
  const labels = [...chosen.map((t) => t.label), ...(pi ? ['Pi'] : [])];
  if (labels.length === 0) return;
  console.log(`\nDone. Restart ${labels.join(', ')} to load the agents.`);
}
