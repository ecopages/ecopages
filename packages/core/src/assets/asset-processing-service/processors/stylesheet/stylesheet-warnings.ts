const seen = new Map<string, { source: string; messages: Set<string> }>();

/**
 * Logs a stylesheet warning once per stylesheet and message while its `source` is unchanged.
 *
 * @remarks
 * A stylesheet goes through several processing passes: once per Page that links it, linked and inlined, and by
 * the build loader, so a single missing reference would otherwise log once per pass. An edit changes `source`,
 * which clears what was logged for the stylesheet, so a warning that is still true after a save is shown again.
 */
export function warnStylesheetOnce(
	stylesheet: string,
	source: string,
	message: string,
	warn: (message: string) => void,
): void {
	let entry = seen.get(stylesheet);
	if (!entry || entry.source !== source) {
		entry = { source, messages: new Set() };
		seen.set(stylesheet, entry);
	}
	if (entry.messages.has(message)) {
		return;
	}
	entry.messages.add(message);
	warn(message);
}
