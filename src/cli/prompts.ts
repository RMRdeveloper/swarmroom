import { createInterface } from 'node:readline/promises';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const letters = 'abcdefghijklmnopqrstuvwxyz';

interface Pickable {
  readonly label: string;
}

/** Pick any number of options; empty input = all. Returns chosen items. */
export async function selectMultiple<T extends Pickable>(
  msg: string,
  options: readonly T[],
): Promise<readonly T[]> {
  console.log(msg);
  options.forEach((o, i) => console.log(`  ${letters[i]}) ${o.label}`));
  const answer = (await rl.question('(empty = all, comma-separated letters)> ')).toLowerCase().replace(/\s/g, '');
  const wanted = new Set(answer === '' ? options.map((_, i) => letters[i]) : answer.split(','));
  const chosen = options.filter((_, i) => wanted.has(letters[i]));
  return chosen.length ? chosen : options;
}

/** Yes/no question. */
export async function confirm(msg: string, defaultYes: boolean): Promise<boolean> {
  const answer = (await rl.question(`${msg} [${defaultYes ? 'Y/n' : 'y/N'}] `)).trim().toLowerCase();
  if (answer === '') return defaultYes;
  return answer === 'y' || answer === 'yes';
}

export function close(): void {
  rl.close();
}