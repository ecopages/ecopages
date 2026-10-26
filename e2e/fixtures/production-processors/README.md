# Production Processors fixture

Acceptance suite for Processors that emit runtime output during `ecopages build`.

It copies the `blog-jsx` template, runs `ecopages build`, and serves collection pages from that output with Processor `setup()` never called and no writes under `.eco/`. Invalid frontmatter fails the build.
