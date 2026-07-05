import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLightDomShim } from '@ecopages/radiant/server/light-dom-shim';
import { ApiField } from './src/components/api-field/api-field';
import { Banner, BannerTitle } from './src/components/banner/banner';
import { CodeTabs } from './src/components/code-tabs';
import { defineDocsKit } from './src/lib/docs-kit/config';
import { docsManifestConfig } from './src/lib/docs-kit/manifest/docs-manifest.config';

installLightDomShim();

defineDocsKit({
	rootDir: path.resolve(path.dirname(fileURLToPath(import.meta.url))),
	manifest: docsManifestConfig,
	mdxComponents: {
		Banner,
		BannerTitle,
		ApiField,
		CodeTabs,
	},
	shellLayout: () => null,
	layoutComponents: [],
	sectionIcons: {},
	strictImageImports: false,
});
