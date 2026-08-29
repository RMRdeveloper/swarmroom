import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedRoot: string | undefined;
let cachedVersion: string | undefined;

/** Walk up from a module URL until `package.json` is found. */
export function packageRoot(metaUrl: string = import.meta.url): string {
  if (cachedRoot !== undefined && metaUrl === import.meta.url) return cachedRoot;
  let dir = path.dirname(fileURLToPath(metaUrl));
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) {
      if (metaUrl === import.meta.url) cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`package.json not found from ${metaUrl}`);
    dir = parent;
  }
}

/** Absolute path to the shipped agent/skill assets. */
export function assetsDir(metaUrl?: string): string {
  return path.join(packageRoot(metaUrl), 'src', 'assets');
}

/** Package version from package.json; cached after first read. */
export function packageVersion(metaUrl: string = import.meta.url): string {
  if (cachedVersion !== undefined && metaUrl === import.meta.url) return cachedVersion;
  const root = packageRoot(metaUrl);
  const pkgPath = path.join(root, 'package.json');
  let raw: { version?: unknown };
  try {
    raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  } catch (error) {
    throw new Error(
      `invalid package.json at ${pkgPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    throw new Error(`missing version in ${pkgPath}`);
  }
  if (metaUrl === import.meta.url) cachedVersion = raw.version;
  return raw.version;
}

/** Clear cached root/version — test only. */
export function clearPackageCacheForTests(): void {
  cachedRoot = undefined;
  cachedVersion = undefined;
}
