/**
 * Recast print options shared by the transforms.
 *
 * @remarks
 * Recast ends reprinted lines with the host's line ending unless told otherwise, so on Windows a rewritten
 * import in an LF file would end in CRLF. The source's own line ending is kept instead.
 */
export function printOptions(source: string) {
	return {
		quote: 'single',
		tabWidth: 2,
		useTabs: true,
		lineTerminator: source.includes('\r\n') ? '\r\n' : '\n',
	} as const;
}
