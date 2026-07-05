'use strict';
class Build extends EasCommand_1.default {
  async runAsync() {
    const { flags: rawFlags } = await this.parse(Build);
    if (rawFlags.json) {
      (0, json_1.enableJsonOutput)();
    }
    const flags = this.sanitizeFlags(rawFlags);
    if (!flags.localBuildOptions.localBuildMode) {
      throw new Error(
        '@leonsilicon/eas-cli has Cloud builds disabled; use the --local flag for local builds'
      );
    }
    const {
      loggedIn: { actor, graphqlClient },
      projectDir,
    } = await this.getContextAsync(Build, {
      nonInteractive: flags.nonInteractive,
      withServerSideEnvironment: null,
    });
    if (!flags.localBuildOptions.localBuildMode) {
      await (0, maybeWarnAboutEasOutagesAsync_1.maybeWarnAboutEasOutagesAsync)(graphqlClient, []);
    }
  }
}
