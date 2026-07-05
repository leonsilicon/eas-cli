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
  await vcsClient.ensureRepoExistsAsync();
  await ensureRepoIsCleanAsync(vcsClient, flags.nonInteractive);
}
