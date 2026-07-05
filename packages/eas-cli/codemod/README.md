# eas-cli local-only patch codemod

JSSG codemod for the `@leonsilicon/eas-cli` fork. It includes the Sanji
`eas-cli` compatibility patches and additionally disables EAS cloud build
creation at the bundle level.

Run this after `packages/eas-cli` has been built and before publishing. This
package emits compiled JavaScript to `packages/eas-cli/build/`, not `dist/`.

## What It Patches

- `build/commands/upload.js` - SDK 53+ Android dev-client APK/AAB detection via
  the `expo-dev-menu` drawable fallback.
- `build/commands/build/index.js` - fails `eas build` without `--local` before
  auth/context/status checks.
- `build/sentry.js` - replaces bundled `@sentry/node` telemetry with a no-op
  shim.
- `build/build/local.js` - runs the local-build-plugin `npx` subprocess from
  `EAS_LOCAL_BUILD_WORKINGDIR` when available.
- `build/build/runBuildAndSubmit.js` - fails regular non-local builds before
  project archive upload.
- `build/graphql/mutations/BuildMutation.js` - replaces `createAndroidBuildAsync`
  and `createIosBuildAsync` with:
  `@leonsilicon/eas-cli has Cloud builds disabled; use the --local flag for local builds`.

## Layout

```text
codemod.yaml      # Codemod package metadata
workflow.yaml     # Standalone codemod workflow
patch.json        # Generator manifest: { npmPackage, bundles[] }
codemod.ts        # JSSG transformation
@fixtures/        # JSSG fixture pairs (input.js / expected.js)
```

## Apply After Build

```sh
cd packages/eas-cli
yarn build
cd codemod
yarn apply:build
```

`apply:build` runs `_apply-codemod.ts`, a Bun script that applies `codemod.ts`
to each expected built bundle under `packages/eas-cli/build/`.

## Run Tests

```sh
cd packages/eas-cli/codemod
yarn test
```

This runs:

```sh
npx --yes codemod@latest jssg test -l javascript ./codemod.ts ./@fixtures --strictness loose
```
