/** Terminal UserGate for both harnesses. Fails fast when stdin is not interactive. */
import { createInterface } from 'node:readline/promises';

import type { GateQuestion, UserGate } from '../harness.ts';
import type { Harness } from '../types.ts';

/** Minimal line reader seam so tests can script answers. */
export interface LineReader {
  question(prompt: string): Promise<string>;
  close(): void;
}

/** Numbered options plus free text, mirroring the harness question tools. */
export async function askOptions(reader: LineReader, question: GateQuestion): Promise<string> {
  console.log(question.question);
  for (const [index, option] of question.options.entries()) {
    console.log(`  ${String(index + 1)}) ${option.label} — ${option.description}`);
  }
  for (;;) {
    const raw = await reader.question('Choice (number or free text)> ');
    const answer = raw.trim();
    if (answer.length === 0) continue;
    const picked = Number.parseInt(answer, 10);
    if (Number.isInteger(picked) && picked >= 1 && picked <= question.options.length) {
      const option = question.options[picked - 1];
      if (option !== undefined) return option.label;
    } else {
      return answer;
    }
  }
}

/** Build a stdin gate. The harness tag only records which session owns the run. */
export function createStdinGate(
  harness: Harness,
  options: { readonly stdin?: NodeJS.ReadableStream; readonly stdout?: NodeJS.WritableStream } = {},
): UserGate {
  return {
    harness,
    async ask(question: GateQuestion): Promise<string> {
      if (!process.stdin.isTTY) {
        throw new Error('gate needs an interactive terminal for human answers');
      }
      const reader = createInterface({
        input: options.stdin ?? process.stdin,
        output: options.stdout ?? process.stdout,
      });
      try {
        return await askOptions(reader, question);
      } finally {
        reader.close();
      }
    },
  };
}
