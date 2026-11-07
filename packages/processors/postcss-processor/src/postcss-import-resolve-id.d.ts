declare module 'postcss-import/lib/resolve-id.js' {
	/** The id resolver postcss-import uses by default, imported statically so a bundled copy keeps it. */
	const resolveId: (id: string, base: string, options: object, node: unknown) => Promise<string>;
	export default resolveId;
}
