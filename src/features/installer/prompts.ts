import { createInterface, type Interface } from 'node:readline/promises';

let rl: Interface | undefined;

function getRl(): Interface {
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
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
  if (tokens.includes('')) return null;

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

export async function selectMultiple<T extends Pickable>(
  msg: string,
  options: readonly T[],
): Promise<readonly T[]> {
  console.log(msg);
  for (const [i, o] of options.entries()) console.log(`  ${String(i + 1)}) ${o.label}`);

  for (;;) {
    const rlInstance = getRl();
    const rawAnswer = await rlInstance.question('(empty = all, comma-separated numbers)> ');
    const answer = rawAnswer.replaceAll(/\s/g, '');
    if (answer === '') return options;

    const wanted = parseSelection(answer, options.length);
    if (!wanted) {
      console.log(`Enter numbers from 1 to ${String(options.length)}, comma-separated.`);
      continue;
    }
    return wanted.map((n) => {
      const item = options[n - 1];
      if (item === undefined) throw new Error(`unreachable: missing option at ${String(n)}`);
      return item;
    });
  }
}

export async function confirm(msg: string, defaultYes: boolean): Promise<boolean> {
  for (;;) {
    const answer = await getRl().question(`${msg} [${defaultYes ? 'Y/n' : 'y/N'}] `);
    const parsed = parseConfirm(answer, defaultYes);
    if (parsed !== null) return parsed;
    console.log('Please answer y or n.');
  }
}

export function close(): void {
  if (!rl) return;
  rl.close();
  rl = undefined;
}
