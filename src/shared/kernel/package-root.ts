import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk up from a module URL until `package.json` is found. */
export function packageRoot(metaUrl: string = import.meta.url): string {
  let dir = path.dirname(fileURLToPath(metaUrl));
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`package.json not found from ${metaUrl}`);
    dir = parent;
  }
}

/** Absolute path to the shipped agent/skill assets. */
export function assetsDir(metaUrl?: string): string {
  return path.join(packageRoot(metaUrl), 'src', 'assets');
}
