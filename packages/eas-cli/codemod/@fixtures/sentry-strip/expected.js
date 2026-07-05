"use strict";
// eas-cli-sentry-stripped: patched by @sanjiapp configs/patching/codemods/eas-cli.
// Replaces eas-cli's bundled `@sentry/node` telemetry with a no-op shim so its
// pinned old `@sentry/node`/`@sentry/core` never lands in the tree and collides
// with the app's own Sentry stack. eas-cli's Sentry is gated on EAS_CLI_SENTRY_DSN
// (never set here), so it was already inert at runtime.
Object.defineProperty(exports, "__esModule", { value: true });
const noop = new Proxy(function () {}, {
    get(_target, prop) {
        // `then` must stay undefined so an accidental `await` on the shim (e.g.
        // `await Sentry.flush(...)`) resolves instead of recursing forever.
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
