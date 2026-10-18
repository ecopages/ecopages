function getBrowserRuntimeMode(): string | undefined {
	return import.meta.env.NODE_ENV ?? import.meta.env.MODE;
}

/** Reports whether the current browser bundle was built in development mode. */
export function isDevelopmentRuntime(): boolean {
	return getBrowserRuntimeMode() === 'development';
}

/** Reports whether the current browser bundle was built in production mode. */
export function isProductionRuntime(): boolean {
	return getBrowserRuntimeMode() === 'production';
}
