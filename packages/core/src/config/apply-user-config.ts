import { ConfigBuilder } from './config-builder.ts';
import { resolveUserConfigRootDir } from './resolve-eco-config-path.ts';
import type { EcoPagesUserConfig } from './user-config-types.ts';

function applyUserDirectoryConfig(builder: ConfigBuilder, userConfig: EcoPagesUserConfig): void {
	if (userConfig.srcDir) builder.setSrcDir(userConfig.srcDir);
	if (userConfig.pagesDir) builder.setPagesDir(userConfig.pagesDir);
	if (userConfig.includesDir) builder.setIncludesDir(userConfig.includesDir);
	if (userConfig.componentsDir) builder.setComponentsDir(userConfig.componentsDir);
	if (userConfig.layoutsDir) builder.setLayoutsDir(userConfig.layoutsDir);
	if (userConfig.publicDir) builder.setPublicDir(userConfig.publicDir);
	if (userConfig.distDir) builder.setDistDir(userConfig.distDir);
	if (userConfig.workDir) builder.setWorkDir(userConfig.workDir);
}

function applyUserPipelineConfig(builder: ConfigBuilder, userConfig: EcoPagesUserConfig): void {
	if (userConfig.integrations) builder.setIntegrations(userConfig.integrations);
	if (userConfig.processors) builder.setProcessors(userConfig.processors);
	if (userConfig.loaders) builder.setLoaders(userConfig.loaders);
	if (userConfig.sourceTransforms) builder.setSourceTransforms(userConfig.sourceTransforms);
	if (userConfig.cache) builder.setCacheConfig(userConfig.cache);
	if (userConfig.buildOwnership) builder.setBuildOwnership(userConfig.buildOwnership);
}

function applyUserMetadataConfig(builder: ConfigBuilder, userConfig: EcoPagesUserConfig): void {
	if (userConfig.baseUrl !== undefined) builder.setBaseUrl(userConfig.baseUrl);
	if (userConfig.robotsTxt) builder.setRobotsTxt(userConfig.robotsTxt);
	if (userConfig.sitemap) builder.setSitemap(userConfig.sitemap);
	if (userConfig.defaultMetadata) builder.setDefaultMetadata(userConfig.defaultMetadata);
}

function applyUserRuntimeConfig(builder: ConfigBuilder, userConfig: EcoPagesUserConfig): void {
	if (userConfig.devToolbar) builder.setDevToolbar(userConfig.devToolbar);
	if (userConfig.additionalWatchPaths) builder.setAdditionalWatchPaths(userConfig.additionalWatchPaths);
	if (userConfig.devPrewarmPaths) builder.setDevPrewarmPaths(userConfig.devPrewarmPaths);
	if (userConfig.devPrewarmBeforeReadyPaths) {
		builder.setDevPrewarmBeforeReadyPaths(userConfig.devPrewarmBeforeReadyPaths);
	}
	if (userConfig.experimental) builder.setExperimental(userConfig.experimental);
}

/**
 * Applies author-owned config fields onto a {@link ConfigBuilder} instance.
 */
export function applyUserConfigToBuilder(
	builder: ConfigBuilder,
	userConfig: EcoPagesUserConfig,
	options: { cwd?: string } = {},
): ConfigBuilder {
	builder.setRootDir(resolveUserConfigRootDir(userConfig.rootDir, options.cwd));
	applyUserDirectoryConfig(builder, userConfig);
	applyUserPipelineConfig(builder, userConfig);
	applyUserMetadataConfig(builder, userConfig);
	applyUserRuntimeConfig(builder, userConfig);
	return builder;
}
