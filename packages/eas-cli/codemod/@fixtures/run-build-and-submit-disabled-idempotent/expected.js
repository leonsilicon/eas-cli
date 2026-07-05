'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.runBuildAndSubmitAsync = runBuildAndSubmitAsync;
async function runBuildAndSubmitAsync({
  graphqlClient,
  analytics,
  vcsClient,
  projectDir,
  flags,
  actor,
}) {
  if (!flags.localBuildOptions.localBuildMode) {
    throw new Error(
      '@leonsilicon/eas-cli has Cloud builds disabled; use the --local flag for local builds'
    );
  }

  await vcsClient.ensureRepoExistsAsync();
  await ensureRepoIsCleanAsync(vcsClient, flags.nonInteractive);
}
