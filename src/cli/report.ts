import { relative } from 'node:path';

import type { Scope, Target } from '../domain/targets.ts';
import type { FileStatus, InstallReport, InstalledFile } from '../io/installer.ts';
import * as style from './style.ts';

const STATUS_ORDER: readonly FileStatus[] = ['new', 'updated', 'skipped'];

export interface ReportOptions {
  readonly verbose: boolean;
  readonly quiet: boolean;
}

function countByStatus(files: readonly InstalledFile[]): Record<FileStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<FileStatus, number>;
  for (const f of files) counts[f.status] += 1;
  return counts;
}

/** Prefer a path relative to destRoot when it stays under that root. */
export function displayPath(dest: string, destRoot: string): string {
  const rel = relative(destRoot, dest);
  if (rel === '' || rel.startsWith('..') || rel.startsWith('/')) return dest;
  return rel;
}

/** Relative to destRoot, else skillsDestRoot, else absolute. */
export function displayPathForReport(dest: string, destRoot: string, skillsDestRoot?: string): string {
  const underAgents = displayPath(dest, destRoot);
  if (underAgents !== dest) return underAgents;
  if (skillsDestRoot === undefined) return dest;
  return displayPath(dest, skillsDestRoot);
}

/** Status count lines; hides zero counts. */
export function formatStatusCounts(counts: Record<FileStatus, number>): readonly string[] {
  return STATUS_ORDER.filter((s) => counts[s] > 0).map(
    (s) => `  ${style.status(s, `${counts[s]} ${s}`)}`,
  );
}

/** Per-file lines for verbose mode: `status  path`. */
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

/** Pure body lines for a target report (no header). */
export function formatTargetBody(report: InstallReport, verbose: boolean): readonly string[] {
  const counts = countByStatus(report.files);
  const lines = [...formatStatusCounts(counts)];
  if (verbose) lines.push(...formatFileLines(report.files, report.destRoot, report.skillsDestRoot));
  return lines;
}

/** Pure body lines for a single-file artifact report. */
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

/** Opening line once: product version + install scope. */
export function printOpening(version: string, scope: Scope, dir: string): void {
  console.log(style.muted(`swarmroom v${version}`));
  if (scope === 'global') {
    console.log('scope: global');
  } else {
    console.log(`scope: project (${dir})`);
  }
}

/** Per-target summary; quiet no-ops. Default hides zero counts; verbose lists files. */
export function printTargetReport(report: InstallReport, options: ReportOptions): void {
  if (options.quiet) return;
  const split =
    report.skillsDestRoot !== undefined && report.skillsDestRoot !== report.destRoot;
  const header = split
    ? `\n${report.target.label} → ${report.destRoot} + ${report.skillsDestRoot}`
    : `\n${report.target.label} → ${report.destRoot}`;
  console.log(header);
  for (const line of formatTargetBody(report, options.verbose)) {
    console.log(line);
  }
}

/** Single-file artifact summary (e.g. CODING_GUIDELINES.md). Quiet no-ops. */
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

/** Closing next-step hint after all installs. */
export function printClosing(chosen: readonly Target[]): void {
  const labels = chosen.map((t) => t.label).join(', ');
  console.log(`\nDone. Restart ${labels} to load the agents.`);
}
