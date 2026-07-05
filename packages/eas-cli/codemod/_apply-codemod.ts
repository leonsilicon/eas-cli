#!/usr/bin/env bun

import { $ } from 'bun';
import path from 'node:path';

const codemodDir = import.meta.dir;
const codemodFile = path.join(codemodDir, 'codemod.ts');

const targets = [
  '../build/commands/upload.js',
  '../build/commands/build/index.js',
  '../build/sentry.js',
  '../build/build/local.js',
  '../build/build/runBuildAndSubmit.js',
  '../build/graphql/mutations/BuildMutation.js',
].map(target => path.join(codemodDir, target));

for (const target of targets) {
  if (!(await Bun.file(target).exists())) {
    throw new Error(`Expected built eas-cli bundle to exist: ${target}`);
  }

  await $`npx --yes codemod@latest jssg run --target ${target} --language javascript --allow-dirty --no-interactive ${codemodFile}`;
}
