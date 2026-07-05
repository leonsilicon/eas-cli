'use strict';
const PLUGIN_PACKAGE_NAME = 'eas-cli-local-build-plugin';
async function runLocalBuildAsync(options, mergedEnv, command, args) {
  const spawnPromise = (0, spawn_async_1.default)(command, args, {
    stdio: options.verbose ? 'inherit' : 'pipe',
    env: mergedEnv,
  });
  await spawnPromise;
}
