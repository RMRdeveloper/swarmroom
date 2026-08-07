import { createInterface, type Interface } from 'node:readline/promises';

let rl: Interface | undefined;

function getRl(): Interface {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

interface Pickable {
  readonly label: string;
}

/**
 * Parse comma-separated 1-based indices. Empty tokens or out-of-range → null.
 * De-duplicates with Set while preserving first-seen order.
 */
export function parseSelection(answer: string, length: number): readonly number[] | null {
  const tokens = answer.split(',');
  if (tokens.some((t) => t === '')) return null;

  const nums = tokens.map((s) => Number.parseInt(s, 10));
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > length)) return null;

  const seen = new Set<number>();
  const unique: number[] = [];
  for (const n of nums) {
    if (seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
  }
  return unique;
}

/** Parse yes/no; empty uses default. Invalid input → null (caller re-asks). */
export function parseConfirm(answer: string, defaultYes: boolean): boolean | null {
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === '') return defaultYes;
  if (trimmed === 'y' || trimmed === 'yes') return true;
  if (trimmed === 'n' || trimmed === 'no') return false;
  return null;
}

/** Pick any number of options; empty input = all. Returns chosen items. */
export async function selectMultiple<T extends Pickable>(
  msg: string,
  options: readonly T[],
): Promise<readonly T[]> {
  console.log(msg);
  options.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}`));

  for (;;) {
    const answer = (await getRl().question('(empty = all, comma-separated numbers)> ')).replace(/\s/g, '');
    if (answer === '') return options;

    const wanted = parseSelection(answer, options.length);
    if (!wanted) {
      console.log(`Enter numbers from 1 to ${options.length}, comma-separated.`);
      continue;
    }
    return wanted.map((n) => options[n - 1]!);
  }
}

/** Yes/no question; re-asks until empty / y / yes / n / no. */
export async function confirm(msg: string, defaultYes: boolean): Promise<boolean> {
  for (;;) {
    const answer = await getRl().question(`${msg} [${defaultYes ? 'Y/n' : 'y/N'}] `);
    const parsed = parseConfirm(answer, defaultYes);
    if (parsed !== null) return parsed;
    console.log('Please answer y or n.');
  }
}

/** Close readline if it was ever opened; otherwise a no-op. */
export function close(): void {
  if (!rl) return;
  rl.close();
  rl = undefined;
}
