export type HtmlPageWarningState = {
	warnedSourceHashes: Map<string, string>;
	renderWarnings: Map<string, { revision: string | undefined; keys: Set<string> }>;
};

export function createHtmlPageWarningState(): HtmlPageWarningState {
	return {
		warnedSourceHashes: new Map(),
		renderWarnings: new Map(),
	};
}
