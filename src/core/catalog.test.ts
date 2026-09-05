import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSystemPrompt,
  getAgentDefinition,
  getLanguageGuidelines,
  getSharedGuidelines,
} from './catalog.ts';
import { LANGUAGES } from './types.ts';

test('loads each shipped language guideline', () => {
  for (const language of LANGUAGES) {
    const guidelines = getLanguageGuidelines(language);
    assert.match(guidelines, /GUIDELINES_TEMPLATE\.md/);
    assert.match(guidelines, /### Guard clauses/);
    assert.match(guidelines, /### YAGNI/);
    assert.match(guidelines, /### Comments/);
    assert.match(guidelines, /### Validate once/);
  }
});

test('combines the complete role prompt with its language policy', () => {
  const role = getAgentDefinition('sw-implementer');
  assert.equal(role.readonly, false);
  assert.match(role.instructions, /Read-first/);
  assert.match(
    buildSystemPrompt('sw-implementer', 'php-laravel'),
    /PHP Laravel Coding Guidelines/,
  );
  assert.match(buildSystemPrompt('sw-implementer', 'php-laravel'), /SRP/);
  assert.match(getSharedGuidelines(), /# Guidelines Template/);
});
