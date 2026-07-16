/**
 * Errors thrown by the React integration renderer and bundling paths.
 */

/**
 * Error thrown when an error occurs while rendering a React component.
 */
export class ReactRenderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReactRenderError';
	}
}

/**
 * Error thrown when an error occurs while bundling a React component.
 */
export class BundleError extends Error {
	public readonly logs: string[];

	constructor(message: string, logs: string[]) {
		super(message);
		this.name = 'BundleError';
		this.logs = logs;
	}
}
