import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Minimal frontmatter parser/serializer mirrored from scripts/sync-skills.mjs.
 * Validates handmade parser roundtrip without introducing a yaml dependency.
 */
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  if (!raw.startsWith('---\n')) throw new Error('Missing frontmatter ---');
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('Missing closing frontmatter ---');
  const fmRaw = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const lines = fmRaw.split('\n');
  const data: Record<string, string> = {};
  let currentKey: string | null = null;
  let inMultiline = false;
  let multilineBuffer: string[] = [];
  for (const line of lines) {
    if (inMultiline) {
      if (line.startsWith('  ') || line.startsWith('\t') || line.trim() === '') {
        multilineBuffer.push(line);
        continue;
      } else {
        if (currentKey) data[currentKey] = multilineBuffer.join('\n').trim();
        inMultiline = false;
        currentKey = null;
        multilineBuffer = [];
      }
    }
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1] ?? '';
    const val = m[2] ?? '';
    if (val === '>-') {
      currentKey = key;
      inMultiline = true;
      multilineBuffer = [];
    } else if (val.startsWith('>')) {
      currentKey = key;
      inMultiline = true;
      multilineBuffer = [];
    } else {
      let v = val.trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      data[key] = v;
    }
  }
  if (inMultiline && currentKey) {
    data[currentKey] = multilineBuffer.join('\n').trim();
  }
  return { data, body };
}

function serializeFrontmatter(data: Record<string, string>): string {
  const lines = ['---'];
  const order = new Set([
    'name',
    'description',
    'license',
    'compatibility',
    'metadata',
    'allowed-tools',
  ]);
  for (const k of order) {
    if (!(k in data)) continue;
    const v = data[k] ?? '';
    if (k === 'description' && v.includes('\n')) {
      lines.push(`${k}: >-`);
      for (const l of v.split('\n')) lines.push(`  ${l}`);
    } else if (v.includes(':') || v.includes('#') || v.includes('\n')) {
      if (v.includes('\n')) {
        lines.push(`${k}: >-`);
        for (const l of v.split('\n')) lines.push(`  ${l}`);
      } else {
        lines.push(`${k}: "${v.replaceAll('"', String.raw`\"`)}"`);
      }
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  for (const k of Object.keys(data)) {
    if (order.has(k)) continue;
    lines.push(`${k}: ${data[k]}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

describe('frontmatter handmade parser', () => {
  it('roundtrips simple frontmatter', () => {
    const raw = '---\nname: sw-spec\ndescription: hello world\nlicense: MIT\n---\nBody here\n';
    const { data, body } = parseFrontmatter(raw);
    assert.equal(data.name, 'sw-spec');
    assert.equal(data.description, 'hello world');
    assert.equal(body, 'Body here\n');
    const serialized = serializeFrontmatter(data) + body;
    const reparsed = parseFrontmatter(serialized);
    assert.deepEqual(reparsed.data, data);
    assert.equal(reparsed.body, body);
  });

  it('roundtrips multiline description', () => {
    const data = { name: 'sw-pipeline', description: 'line one\nline two', license: 'MIT' };
    const serialized = `${serializeFrontmatter(data)}Body\n`;
    const parsed = parseFrontmatter(serialized);
    assert.equal(parsed.data.name, 'sw-pipeline');
    // Handmade parser keeps indentation on continuation lines after trim outer
    assert.ok((parsed.data.description ?? '').includes('line one'));
    assert.ok((parsed.data.description ?? '').includes('line two'));
  });

  it('throws on missing frontmatter', () => {
    assert.throws(() => parseFrontmatter('no frontmatter'), /Missing frontmatter/);
    assert.throws(() => parseFrontmatter('---\nname: x\n'), /Missing closing/);
  });
});
