/**
 * Canonical route slice for cross-runtime/host parity checks.
 *
 * The `@parity` spec navigates these in sequence on every supported cell
 * (ecopages+node, ecopages+bun, vite+node, vite+bun) to certify that plain
 * document navigation renders identically across runtimes. Keep this list small
 * and representative: one entry per distinct rendering path, not the full shell
 * tour (that depth stays on the canonical dev project only).
 */
export const parityRoutes = ['/', '/images', '/transitions', '/latest', '/catalog/semantic-html'] as const;
