import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk up from a module URL until `package.json` is found. */
export function packageRoot(metaUrl: string = import.meta.url): string {
  let dir = dirname(fileURLToPath(metaUrl));
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`package.json not found from ${metaUrl}`);
    dir = parent;
  }
}

/** Absolute path to the shipped agent/skill assets. */
export function assetsDir(metaUrl?: string): string {
  return join(packageRoot(metaUrl), 'src', 'assets');
}
