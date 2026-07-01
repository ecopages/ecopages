/** JSX runtimes ecopages ships integrations for. */
export type KnownJsxImportSource = '@kitajs/html' | 'react' | '@ecopages/jsx';

/**
 * Any jsxImportSource. Known runtimes surface in autocomplete; the
 * `(string & {})` arm keeps arbitrary custom runtimes assignable without
 * TypeScript widening the union back to plain `string`.
 */
export type JsxImportSource = KnownJsxImportSource | (string & {});

/** JSX runtimes valid for standalone `mdxPlugin()` (excludes ecopages-owned integrations). */
export type ThirdPartyJsxImportSource = Exclude<KnownJsxImportSource, 'react' | '@ecopages/jsx'> | (string & {});
