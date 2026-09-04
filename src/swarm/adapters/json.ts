/** Extracts the model JSON payload from noisy harness CLI output. */

/** Last fenced ```json block, or null when absent. */
function lastFencedJson(text: string): string | null {
  const pattern = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let last: string | null = null;
  for (const match of text.matchAll(pattern)) {
    const block = match[1];
    if (block !== undefined) last = block;
  }
  return last;
}

/** Opening bracket positions in source order. */
function bracketStarts(text: string): number[] {
  const starts: number[] = [];
  for (const match of text.matchAll(/[[{]/g)) {
    starts.push(match.index);
  }
  return starts;
}

/** Balanced span starting at `start`, or null when it never closes. */
function scanBalancedSpan(text: string, start: number): string | null {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  let index = start;
  for (const char of text.slice(start)) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else {
      switch (char) {
        case '"': {
          inString = true;
          break;
        }
        case open: {
          depth += 1;
          break;
        }
        case close: {
          depth -= 1;
          if (depth === 0) return text.slice(start, index + char.length);
          break;
        }
        default: {
          break;
        }
      }
    }
    index += char.length;
  }
  return null;
}

/** First balanced {...} or [...] span in source order, or null when absent. */
function firstBalancedSpan(text: string): string | null {
  for (const start of bracketStarts(text)) {
    const span = scanBalancedSpan(text, start);
    if (span !== null) return span;
  }
  return null;
}

/** Any JSON value parsed from harness CLI output. */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * Parse the first candidate that works; fail fast with output context otherwise.
 * Callers validate the returned value against their own schema at the boundary.
 */
export function extractJson(text: string): JsonValue {
  const candidates: string[] = [];
  const fenced = lastFencedJson(text);
  if (fenced !== null) candidates.push(fenced);
  const trimmed = text.trim();
  if (trimmed.length > 0) candidates.push(trimmed);
  const span = firstBalancedSpan(text);
  if (span !== null) candidates.push(span);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as JsonValue;
    } catch {
      continue;
    }
  }
  throw new Error(
    `model did not return parseable JSON (output tail: ${JSON.stringify(text.slice(-300))})`,
  );
}
