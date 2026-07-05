'use strict';
const PLUGIN_PACKAGE_NAME = 'eas-cli-local-build-plugin';
async function runLocalBuildAsync(options, mergedEnv, command, args) {
  const spawnPromise = (0, spawn_async_1.default)(command, args, {
    stdio: options.verbose ? 'inherit' : 'pipe',
    env: mergedEnv,
    // eas-cli-local-build-npx-cwd: keep npm/npx outside workspace roots so
    // root package overrides do not affect the temporary plugin install.
    cwd: mergedEnv.EAS_LOCAL_BUILD_WORKINGDIR ?? process.cwd(),
  });
  await spawnPromise;
}
