'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.BuildMutation = void 0;
const client_1 = require('../client');
const CLOUD_BUILDS_DISABLED_MESSAGE =
  '@leonsilicon/eas-cli has Cloud builds disabled; use the --local flag for local builds';

exports.BuildMutation = {
  async createAndroidBuildAsync(graphqlClient, input) {
    throw new Error(CLOUD_BUILDS_DISABLED_MESSAGE);
  },
  async createIosBuildAsync(graphqlClient, input) {
    throw new Error(CLOUD_BUILDS_DISABLED_MESSAGE);
  },
  async updateBuildMetadataAsync(graphqlClient, input) {
    return graphqlClient.mutation('UpdateBuildMetadataMutation', input).toPromise();
  },
};
