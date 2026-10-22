# Shared Utilities

**Layer:** Foundation.

This directory contains generic helpers used across core. Utilities may depend on other Foundation modules, but should not import build, rendering, development, or application assembly code.

Shared helpers here define path containment for both inclusive and strict descendants, markup escaping for HTML and XML, one-pass or stable HTML entity decoding, literal regular-expression escaping, and stable SHA-256 content digests. `contentHash(input)` accepts text or bytes and returns the full lowercase hexadecimal digest; pass an integer length from 1 to 64 to return a prefix. Other lengths throw `RangeError`. `formatErrorChain(error)` returns an error's stack followed by the stack of each `cause`, because `Error.prototype.stack` omits causes and the app logger prints only the stack. `endpoint-file-extensions.ts` is the one definition of the endpoint file marker (`.api.ts`, `.api.tsx`, `.api.js`, `.api.jsx`), read by the Route Registry scan and by config assembly's Integration extension check.
