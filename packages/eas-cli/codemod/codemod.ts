/**
 * JSSG codemod that patches `eas-cli` for several independent issues. It spans
 * several
 * bundles and dispatches on their content (not filename, so the fixture pairs —
 * all named `input.js` — still route correctly):
 *
 *   1. `build/commands/upload.js` — fix SDK 53+ Android dev-client detection.
 *   2. `build/sentry.js` — strip eas-cli's bundled `@sentry/node` telemetry.
 *   3. `build/build/local.js` — run local-build-plugin `npx` outside the repo.
 *   4. `build/graphql/mutations/BuildMutation.js` — disable EAS cloud builds.
 *   5. `build/build/runBuildAndSubmit.js` — fail non-local builds before upload.
 *   6. `build/commands/build/index.js` — fail `eas build` before context setup.
 *
 * ── (1) Android dev-client detection ────────────────────────────────────────
 *
 * `extractAppMetadataAsync` (build/commands/upload.js) decides whether an
 * uploaded `.apk`/`.aab` is a dev-client build by probing for a single zip
 * entry — `assets/EXDevMenuApp.android.js`. SDK 53+ no longer ships that bundle
 * inside dev-client APKs, so the probe misses and the build is mislabelled as a
 * production build on upload. expo-dev-menu still embeds its native drawable
 * (`res/drawable<dpi>/dev_menu_fab_icon.png`) only when the library's debug
 * source set is compiled in — i.e. exactly in dev-client builds — so it's a
 * reliable fallback signal.
 *
 * This patch injects, immediately after the existing
 * `developmentClient = Boolean(await zip.entry(...devMenuBundlePath...))`
 * assignment, a fallback that scans the zip's entry names for that drawable and
 * flips `developmentClient` to `true` on a match.
 *
 * Strategy. The published bundle is readable (not minified), but identifiers
 * like `zip` / `developmentClient` / the `path_1`/`basePath` locals are bundler
 * artefacts that could drift across releases. Rather than anchoring on byte
 * offsets we locate the assignment structurally with ast-grep:
 *
 *   1. Find the `expression_statement` whose expression is an assignment
 *      `<lhs> = Boolean(await <zipObj>.entry(...))` where the `Boolean` call's
 *      argument is `await <zipObj>.entry(...)`. We read three identifiers out of
 *      that shape — the assignment target (`developmentClient`), the zip object
 *      (`zip`), and confirm the `devMenuBundlePath` reference — so the injected
 *      block uses whatever names this build chose.
 *   2. Skip if the fallback marker is already present (idempotent).
 *   3. Insert the fallback `if (!<lhs>) { ... }` block after the statement.
 *
 * The block reuses the bundle's own `<zipObj>` and assignment-target
 * identifiers, so it survives renames as long as the assignment keeps its
 * `Boolean(await <zip>.entry(...))` shape. If that shape ever changes the
 * transform emits no edit (returns `null`) — the signal to re-check upstream
 * rather than silently ship a broken patch.
 *
 * ── (2) Sentry strip ────────────────────────────────────────────────────────
 *
 * `build/sentry.js` does `require("@sentry/node")`, inits it, and re-exports the
 * namespace as its default. eas-cli pins `@sentry/node@7.77.0`, which transitively
 * pulls an old `@sentry/core` that collides with the app's own Sentry stack
 * (`@sentry/react`/`@sentry/react-native`) the moment any `@sentry/core`-shaped
 * override touches resolution — the InboundFilters EAS-build crash. eas-cli's
 * Sentry is purely its own opt-in error telemetry (gated on `EAS_CLI_SENTRY_DSN`,
 * which we never set), so it's already inert at runtime. We replace the whole
 * module with a no-op `Proxy` shim that drops the `@sentry/node` require entirely,
 * so no version of it can land in the tree and conflict. The two consumers
 * (`EasCommand.js`, `project/ios/entitlements.js`) call `init`/`setTag`/`setUser`/
 * `flush`/`captureException`/`captureMessage`/`withScope(scope => …)` on the
 * default export; the shim answers every property access with a chainable no-op,
 * so all of those keep working.
 *
 * ── (3) Local-build plugin npx cwd ──────────────────────────────────────────
 *
 * `eas build --local` shells out to `npx -y eas-cli-local-build-plugin@...`
 * from the current project directory. In this monorepo that makes npm read the
 * root `package.json#overrides`; npm then rejects the temporary plugin install
 * with EOVERRIDE when an override differs from a direct devDependency range.
 * The plugin only needs the base64 job payload, not the project cwd, so we run
 * that one `npx` subprocess from `EAS_LOCAL_BUILD_WORKINGDIR` when EAS already
 * provides it. That keeps npm away from workspace overrides without affecting
 * normal local builds that do not set the env var.
 *
 * ── (4) Cloud build disablement ────────────────────────────────────────────
 *
 * This fork is local-build-only. `runBuildAndSubmitAsync` fails immediately for
 * non-local build modes so regular `eas build` never packages/uploads the
 * project archive. The two cloud-build creation methods in
 * `build/graphql/mutations/BuildMutation.js` are also replaced with explicit
 * throws before they can call the GraphQL mutation that schedules Android or iOS
 * builds on EAS cloud infrastructure. Local builds still work because they use
 * `LOCAL_BUILD_PLUGIN` or `INTERNAL`; internal/local metadata updates and retry
 * helpers are left untouched.
 */

import type { Edit, SgNode, Transform } from '@codemod.com/jssg-types/main';
import type JavaScript from '@codemod.com/jssg-types/langs/javascript';

// Idempotency / dispatch marker for the upload.js transform. The injected block
// scans for the dev-menu drawable, so its filename is a stable sentinel that
// never appears in the pristine bundle.
const MARKER = 'dev_menu_fab_icon';

// The drawable matcher embedded into the bundle. Single-quoted so it survives
// the structural insertion verbatim; the leading-anchor + extension wildcard
// tolerate `drawable`, `drawable-hdpi`, … and `.png`/`.webp`.
const DRAWABLE_RE = String.raw`/^res\/drawable[^/]*\/dev_menu_fab_icon\.[a-z0-9]+$/`;

// Content signature that identifies the pristine `build/sentry.js` bundle: it is
// the only eas-cli module that requires `@sentry/node` and inits it. We dispatch
// on content rather than filename so the fixtures (all `input.js`) route too.
const SENTRY_REQUIRE_RE = /require\(\s*["']@sentry\/node["']\s*\)/;

// Idempotency marker the shim leaves behind so a re-run is a no-op.
const SENTRY_SHIM_MARKER = 'eas-cli-sentry-stripped';

// Content signature that identifies `build/build/local.js`.
const LOCAL_BUILD_PLUGIN_RE = /const PLUGIN_PACKAGE_NAME = ['"]eas-cli-local-build-plugin['"]/;

// Idempotency marker for the `npx` cwd patch.
const LOCAL_BUILD_NPX_CWD_MARKER = 'eas-cli-local-build-npx-cwd';

// Content signature that identifies `build/graphql/mutations/BuildMutation.js`.
const CLOUD_BUILD_MUTATION_RE =
  /createAndroidBuildAsync[\s\S]*createAndroidBuild[\s\S]*createIosBuildAsync[\s\S]*createIosBuild/;

// Idempotency marker for the cloud-build disablement patch.
const CLOUD_BUILDS_DISABLED_MARKER = '@leonsilicon/eas-cli has Cloud builds disabled';

const CLOUD_BUILDS_DISABLED_MESSAGE =
  '@leonsilicon/eas-cli has Cloud builds disabled; use the --local flag for local builds';

// Content signature that identifies `build/build/runBuildAndSubmit.js`.
const RUN_BUILD_AND_SUBMIT_RE =
  /async function runBuildAndSubmitAsync\(\{[\s\S]*await vcsClient\.ensureRepoExistsAsync\(\);/;

// Content signature that identifies `build/commands/build/index.js`.
const BUILD_COMMAND_RE =
  /class Build extends[\s\S]*const flags = this\.sanitizeFlags\(rawFlags\);[\s\S]*maybeWarnAboutEasOutagesAsync/;

// The drop-in replacement for `build/sentry.js`. No `require("@sentry/node")`, so
// the package never has to be installed and can't drag a conflicting
// `@sentry/core` into the tree. The default export is a recursive no-op `Proxy`:
// every property read returns a callable that ignores its args and returns the
// same no-op (so chains and `withScope(scope => …)` callbacks work), and calls on
// the proxy itself are no-ops too. Covers every method the eas-cli consumers
// touch — init/setTag/setUser/flush/captureException/captureMessage/withScope.
const SENTRY_SHIM = `"use strict";
// eas-cli-sentry-stripped: patched by @sanjiapp configs/patching/codemods/eas-cli.
// Replaces eas-cli's bundled \`@sentry/node\` telemetry with a no-op shim so its
// pinned old \`@sentry/node\`/\`@sentry/core\` never lands in the tree and collides
// with the app's own Sentry stack. eas-cli's Sentry is gated on EAS_CLI_SENTRY_DSN
// (never set here), so it was already inert at runtime.
Object.defineProperty(exports, "__esModule", { value: true });
const noop = new Proxy(function () {}, {
    get(_target, prop) {
        // \`then\` must stay undefined so an accidental \`await\` on the shim (e.g.
        // \`await Sentry.flush(...)\`) resolves instead of recursing forever.
        if (prop === "then") {
            return undefined;
        }
        return noop;
    },
    apply() {
        return noop;
    },
    construct() {
        return noop;
    },
});
exports.default = noop;
`;

const codemod: Transform<JavaScript> = async root => {
  const rootNode = root.root();
  const source = rootNode.text();

  // Dispatch on content. `build/sentry.js` is the only module that requires
  // `@sentry/node`; `build/build/local.js` is the only module that references
  // the local build plugin package; everything else is treated as upload.js.
  if (SENTRY_REQUIRE_RE.test(source)) {
    return transformSentry(source);
  }
  if (LOCAL_BUILD_PLUGIN_RE.test(source)) {
    return transformLocalBuild(source);
  }
  if (CLOUD_BUILD_MUTATION_RE.test(source)) {
    return transformCloudBuildMutation(source);
  }
  if (RUN_BUILD_AND_SUBMIT_RE.test(source)) {
    return transformRunBuildAndSubmit(source);
  }
  if (BUILD_COMMAND_RE.test(source)) {
    return transformBuildCommand(source);
  }
  return transformUpload(rootNode);
};

/**
 * Replace the whole `build/sentry.js` module body with a no-op shim that no
 * longer requires `@sentry/node`. Returns the new file text, or `null` if the
 * shim is already in place (idempotent).
 */
function transformSentry(source: string): string | null {
  if (source.includes(SENTRY_SHIM_MARKER)) {
    return null;
  }
  return SENTRY_SHIM;
}

/**
 * Keep eas-cli's internal `npx eas-cli-local-build-plugin` install away from
 * Sanji's workspace root, where npm would otherwise apply root package
 * overrides to the temporary plugin install.
 */
function transformLocalBuild(source: string): string | null {
  if (source.includes(LOCAL_BUILD_NPX_CWD_MARKER)) {
    return null;
  }

  const anchorRe = /^([ \t]*)env: mergedEnv,\n([ \t]*)\}\);/m;
  const match = anchorRe.exec(source);
  if (match === null) {
    return null;
  }

  const propIndent = match[1] ?? '';
  const closeIndent = match[2] ?? '';
  const replacement =
    `${propIndent}env: mergedEnv,\n` +
    `${propIndent}// ${LOCAL_BUILD_NPX_CWD_MARKER}: keep npm/npx outside workspace roots so\n` +
    `${propIndent}// root package overrides do not affect the temporary plugin install.\n` +
    `${propIndent}cwd: mergedEnv.EAS_LOCAL_BUILD_WORKINGDIR ?? process.cwd(),\n` +
    `${closeIndent}});`;

  return source.replace(anchorRe, replacement);
}

/**
 * Replace only the methods that schedule EAS cloud builds. The method boundary
 * is anchored by the next method name rather than matching the GraphQL template
 * body, which contains many braces that make regex body matching fragile.
 */
function transformCloudBuildMutation(source: string): string | null {
  if (source.includes(CLOUD_BUILDS_DISABLED_MARKER)) {
    return null;
  }

  let output = source;
  output = insertCloudBuildDisabledConstant(output);
  output = replaceMethodSlice(output, {
    methodName: 'createAndroidBuildAsync',
    nextMethodName: 'createIosBuildAsync',
  });
  output = replaceMethodSlice(output, {
    methodName: 'createIosBuildAsync',
    nextMethodName: 'updateBuildMetadataAsync',
  });

  return output === source ? null : output;
}

function insertCloudBuildDisabledConstant(source: string): string {
  const exportObjectRe = /^([ \t]*)exports\.BuildMutation = \{/m;
  const match = exportObjectRe.exec(source);
  if (match === null) {
    return source;
  }

  const indent = match[1] ?? '';
  const constant =
    `${indent}const CLOUD_BUILDS_DISABLED_MESSAGE =\n` +
    `${indent}    ${JSON.stringify(CLOUD_BUILDS_DISABLED_MESSAGE)};\n\n`;
  return source.slice(0, match.index) + constant + source.slice(match.index);
}

function replaceMethodSlice(
  source: string,
  {
    methodName,
    nextMethodName,
  }: {
    methodName: string;
    nextMethodName: string;
  }
): string {
  const methodRe = new RegExp(`^([ \\t]*)async ${methodName}\\(([^)]*)\\) \\{`, 'm');
  const methodMatch = methodRe.exec(source);
  if (methodMatch === null) {
    return source;
  }

  const nextMethodRe = new RegExp(
    `^${escapeRegExp(methodMatch[1] ?? '')}async ${nextMethodName}\\(`,
    'm'
  );
  nextMethodRe.lastIndex = methodMatch.index + methodMatch[0].length;
  const nextMatch = nextMethodRe.exec(source.slice(methodMatch.index + methodMatch[0].length));
  if (nextMatch === null) {
    return source;
  }

  const start = methodMatch.index;
  const end = methodMatch.index + methodMatch[0].length + nextMatch.index;
  const indent = methodMatch[1] ?? '';
  const args = methodMatch[2] ?? '';
  const bodyIndent = indent + '    ';
  const replacement =
    `${indent}async ${methodName}(${args}) {\n` +
    `${bodyIndent}throw new Error(CLOUD_BUILDS_DISABLED_MESSAGE);\n` +
    `${indent}},\n`;

  return source.slice(0, start) + replacement + source.slice(end);
}

/**
 * Fail regular cloud builds before archive creation/upload. This intentionally
 * leaves local build modes alone.
 */
function transformRunBuildAndSubmit(source: string): string | null {
  if (source.includes(CLOUD_BUILDS_DISABLED_MARKER)) {
    return null;
  }

  const anchorRe = /^([ \t]*)await vcsClient\.ensureRepoExistsAsync\(\);/m;
  const match = anchorRe.exec(source);
  if (match === null) {
    return null;
  }

  const indent = match[1] ?? '';
  const bodyIndent = `${indent}  `;
  const replacement =
    `${indent}if (!flags.localBuildOptions.localBuildMode) {\n` +
    `${bodyIndent}throw new Error(${JSON.stringify(CLOUD_BUILDS_DISABLED_MESSAGE)});\n` +
    `${indent}}\n\n` +
    `${indent}await vcsClient.ensureRepoExistsAsync();`;

  return source.replace(anchorRe, replacement);
}

/**
 * Fail `eas build` before logged-in/project context and statuspage checks.
 */
function transformBuildCommand(source: string): string | null {
  if (source.includes(CLOUD_BUILDS_DISABLED_MARKER)) {
    return null;
  }

  const anchorRe = /^([ \t]*)const flags = this\.sanitizeFlags\(rawFlags\);\n([ \t]*)const \{/m;
  const match = anchorRe.exec(source);
  if (match === null) {
    return null;
  }

  const indent = match[1] ?? '';
  const bodyIndent = `${indent}  `;
  const nextIndent = match[2] ?? indent;
  const replacement =
    `${indent}const flags = this.sanitizeFlags(rawFlags);\n` +
    `${indent}if (!flags.localBuildOptions.localBuildMode) {\n` +
    `${bodyIndent}throw new Error(${JSON.stringify(CLOUD_BUILDS_DISABLED_MESSAGE)});\n` +
    `${indent}}\n` +
    `${nextIndent}const {`;

  return source.replace(anchorRe, replacement);
}

/**
 * The dev-client detection rewrite for `build/commands/upload.js`. Returns the
 * edited file text, or `null` when the structural anchor isn't found (already
 * patched, or the bundle's shape drifted).
 */
function transformUpload(rootNode: SgNode<JavaScript>): string | null {
  if (rootNode.text().includes(MARKER)) {
    return null;
  }

  // Locate the dev-client assignment: `<lhs> = Boolean(await <zip>.entry(...))`.
  // We match the assignment_expression structurally, then validate the RHS
  // shape and pull the identifiers out by hand (ast-grep metavariables can't
  // express "the object of the await-ed call" cleanly across builds).
  const assignments = rootNode.findAll({
    rule: { kind: 'assignment_expression' },
  });

  for (const assign of assignments) {
    const lhs = assign.field('left');
    const rhs = assign.field('right');
    if (lhs === null || rhs === null) {
      continue;
    }
    if (lhs.kind() !== 'identifier') {
      continue;
    }
    const parsed = parseBooleanEntryCall(rhs);
    if (parsed === null) {
      continue;
    }
    const target = lhs.text();
    const edit = buildFallbackEdit(assign, target, parsed.zipIdent);
    if (edit !== null) {
      return rootNode.commitEdits([edit]);
    }
  }

  return null;
}

interface BooleanEntryCall {
  zipIdent: string;
}

/**
 * Validate that `rhs` is `Boolean(await <zip>.entry(<arg>))` and return the
 * `<zip>` identifier text. Returns `null` for anything else so we never inject
 * against an unexpected shape.
 */
function parseBooleanEntryCall(rhs: SgNode<JavaScript>): BooleanEntryCall | null {
  if (rhs.kind() !== 'call_expression') {
    return null;
  }
  const fn = rhs.field('function');
  if (fn === null || fn.text() !== 'Boolean') {
    return null;
  }
  const args = namedChildren(rhs.field('arguments'));
  if (args.length !== 1) {
    return null;
  }
  // The sole argument is `await <zip>.entry(...)`.
  const awaited = args[0];
  if (awaited === undefined || awaited.kind() !== 'await_expression') {
    return null;
  }
  const entryCall = firstNamedChild(awaited);
  if (entryCall === null || entryCall.kind() !== 'call_expression') {
    return null;
  }
  const callee = entryCall.field('function');
  // `<zip>.entry`
  if (callee === null || callee.kind() !== 'member_expression') {
    return null;
  }
  const property = callee.field('property');
  if (property === null || property.text() !== 'entry') {
    return null;
  }
  const object = callee.field('object');
  if (object === null || object.kind() !== 'identifier') {
    return null;
  }
  return { zipIdent: object.text() };
}

/**
 * Build the in-place edit that appends the drawable-scan fallback after the
 * dev-client assignment statement. The injection reuses the bundle's own
 * assignment-target (`<lhs>`) and zip-object (`<zip>`) identifiers and matches
 * the surrounding 12-space indentation of the `try` block. Returns `null` if
 * the assignment isn't wrapped in an `expression_statement` (so we can append
 * after a complete statement rather than splice mid-expression).
 */
function buildFallbackEdit(
  assign: SgNode<JavaScript>,
  target: string,
  zipIdent: string
): Edit | null {
  const statement = assign.parent();
  if (statement === null || statement.kind() !== 'expression_statement') {
    return null;
  }

  const fallback =
    '\n' +
    `            if (!${target}) {\n` +
    '                // Fallback: SDK 53+ no longer ships `assets/EXDevMenuApp.android.js` in dev-client APKs.\n' +
    '                // expo-dev-menu still bundles its native drawable (`res/drawable*/dev_menu_fab_icon.png`)\n' +
    "                // only when the library's debug source set is compiled in, i.e. dev-client builds.\n" +
    `                const allEntries = await ${zipIdent}.entries();\n` +
    '                for (const entryName of Object.keys(allEntries)) {\n' +
    `                    if (${DRAWABLE_RE}.test(entryName)) {\n` +
    `                        ${target} = true;\n` +
    '                        break;\n' +
    '                    }\n' +
    '                }\n' +
    '            }';

  return statement.replace(statement.text() + fallback);
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function namedChildren(node: SgNode<JavaScript> | null): SgNode<JavaScript>[] {
  if (node === null) {
    return [];
  }
  return node.children().filter(child => child.isNamed());
}

function firstNamedChild(node: SgNode<JavaScript>): SgNode<JavaScript> | null {
  return node.children().find(child => child.isNamed()) ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default codemod;
