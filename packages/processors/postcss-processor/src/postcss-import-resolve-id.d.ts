/** The id resolver postcss-import uses by default. */
declare const resolveId: (id: string, base: string, options: object, node: unknown) => Promise<string>;
export default resolveId;
