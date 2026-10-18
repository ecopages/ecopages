# Core Types

**Layer:** Foundation.

This directory defines the public and internal contracts shared across core. `app-runtime.ts` holds the per-app runtime shape and the `requireAppRuntime()` accessor. It may refer to higher-layer types through type-only imports; runtime imports from this layer stay within Foundation.
