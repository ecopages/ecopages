/**
 * Formats an error and its `cause` chain as one multi-line string.
 *
 * @remarks
 * `Error.prototype.stack` never includes `cause`, and the app logger prints only `stack`, so a wrapper error such
 * as a render failure would otherwise hide the stack and code frame of the error it wraps. An error without a
 * cause formats to its own stack unchanged. Circular cause chains stop at the first repeated error.
 */
export function formatErrorChain(error: unknown): string {
	const seen = new Set<unknown>();
	const lines: string[] = [];
	let current: unknown = error;
	while (current !== undefined && !seen.has(current)) {
		seen.add(current);
		const text =
			current instanceof Error ? (current.stack ?? `${current.name}: ${current.message}`) : String(current);
		lines.push(lines.length === 0 ? text : `Caused by: ${text}`);
		current = current instanceof Error ? current.cause : undefined;
	}
	return lines.join('\n');
}
