import type { EcoPagesAppConfig } from '../types/internal-types.ts';

export function createJsxImportSourcePragma(jsxImportSource: string): string {
	return `/** @jsxImportSource ${jsxImportSource} */\n`;
}

export function isJsxSourceExtension(extension: string): boolean {
	return extension.endsWith('.tsx') || extension.endsWith('.jsx');
}

export function filterJsxSourceExtensions(extensions: string[]): string[] {
	return extensions.filter(isJsxSourceExtension);
}

export function collectJsxExtensions(
	integrations: NonNullable<EcoPagesAppConfig['integrations']>,
	options?: { excludeIntegrationName?: string },
): string[] {
	return integrations
		.filter((integration) => integration.jsxImportSource)
		.filter((integration) => integration.name !== options?.excludeIntegrationName)
		.flatMap((integration) => filterJsxSourceExtensions(integration.extensions));
}
