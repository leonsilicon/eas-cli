import { describe, expect, it } from '@jest/globals';
// JSSG codemods have no package `exports` (they're invoked by the codemod CLI), so
// import the transform module directly. Assert the default export is a transform
// function; the fixture-driven behavioral checks run via `codemod jssg test`.
import codemod from '../codemod.ts';

describe('eas-cli codemod', () => {
  it('default-exports a JSSG transform function', () => {
    expect(typeof codemod).toBe('function');
  });
});
