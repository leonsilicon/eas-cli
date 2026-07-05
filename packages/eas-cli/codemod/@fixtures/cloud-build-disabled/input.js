'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.BuildMutation = void 0;
const client_1 = require('../client');
exports.BuildMutation = {
  async createAndroidBuildAsync(graphqlClient, input) {
    const data = await (0, client_1.withErrorHandlingAsync)(
      graphqlClient
        .mutation(
          (0, graphql_tag_1.default)`
            mutation CreateAndroidBuildMutation {
              build {
                createAndroidBuild {
                  build {
                    id
                  }
                }
              }
            }
          `,
          input,
          { noRetry: true }
        )
        .toPromise()
    );
    return data.build.createAndroidBuild;
  },
  async createIosBuildAsync(graphqlClient, input) {
    const data = await (0, client_1.withErrorHandlingAsync)(
      graphqlClient
        .mutation(
          (0, graphql_tag_1.default)`
            mutation CreateIosBuildMutation {
              build {
                createIosBuild {
                  build {
                    id
                  }
                }
              }
            }
          `,
          input,
          { noRetry: true }
        )
        .toPromise()
    );
    return data.build.createIosBuild;
  },
  async updateBuildMetadataAsync(graphqlClient, input) {
    return graphqlClient.mutation('UpdateBuildMetadataMutation', input).toPromise();
  },
};
