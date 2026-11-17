/**
 * Recast print options shared by the transforms.
 *
 * @remarks
 * Recast ends reprinted lines with the host's line ending unless told otherwise, so on Windows a rewritten
 * import in an LF file would end in CRLF. The source's own line ending is kept instead. Recast measures a kept line's
 * tabs in `tabWidth` columns and indents new code by the same step, so tabs count as 4 columns; the indentation style
 * follows most of the source, tabs or spaces. Recast still prints new objects one key per line and may indent their
 * inner lines with spaces in a tabbed file, so run the project's formatter after a transform.
 */
export function printOptions(source: string) {
	const tabbed = source.match(/^\t/gm)?.length ?? 0;
	const spaced = source.match(/^ {2,}(?=[^ *])/gm) ?? [];
	const useTabs = tabbed >= spaced.length;
	return {
		quote: 'single',
		tabWidth: useTabs ? 4 : Math.min(...spaced.map((indent) => indent.length)),
		useTabs,
		lineTerminator: source.includes('\r\n') ? '\r\n' : '\n',
	} as const;
}
