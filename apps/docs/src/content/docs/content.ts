import type { DocsSiteContent } from '@/lib/docs-kit/content/docs-site-content.types';

import { attachDocsContentModules } from './attach-docs-content-modules';
import { docsSiteContentMeta } from './content.meta';
import CoreArchitecture from './core/architecture.mdx';
import CoreBuildAndHost from './core/build-and-host.mdx';
import CoreComponents from './core/components.mdx';
import CoreConcepts from './core/concepts.mdx';
import CoreDataFetching from './core/data-fetching.mdx';
import CoreHmr from './core/hmr.mdx';
import CoreIncludes from './core/includes.mdx';
import CoreLayouts from './core/layouts.mdx';
import CorePages from './core/pages.mdx';
import CorePluginLifecycle from './core/plugin-lifecycle.mdx';
import CoreRequestLocals from './core/request-locals.mdx';
import CoreRouting from './core/routing.mdx';
import EcosystemBrowserRouter from './ecosystem/browser-router.mdx';
import EcosystemEcopages from './ecosystem/ecopages.mdx';
import EcosystemFileSystem from './ecosystem/file-system.mdx';
import EcosystemImageProcessor from './ecosystem/image-processor.mdx';
import EcosystemPackages from './ecosystem/packages.mdx';
import EcosystemPostcssProcessor from './ecosystem/postcss-processor.mdx';
import EcosystemRadiant from './ecosystem/radiant.mdx';
import EcosystemReactRouter from './ecosystem/react-router.mdx';
import EcosystemVitePlugin from './ecosystem/vite-plugin.mdx';
import GettingStartedConfiguration from './getting-started/configuration.mdx';
import GettingStartedInstallation from './getting-started/installation.mdx';
import GettingStartedIntroduction from './getting-started/introduction.mdx';
import IntegrationsEcopagesJsx from './integrations/ecopages-jsx.mdx';
import IntegrationsKitajs from './integrations/kitajs.mdx';
import IntegrationsLit from './integrations/lit.mdx';
import IntegrationsMdx from './integrations/mdx.mdx';
import IntegrationsOverview from './integrations/overview.mdx';
import IntegrationsReact from './integrations/react.mdx';
import PluginsCustomIntegration from './plugins/custom-integration.mdx';
import PluginsCustomProcessor from './plugins/custom-processor.mdx';
import PluginsSourceTransforms from './plugins/source-transforms.mdx';
import PluginsOverview from './plugins/overview.mdx';
import ReferenceCliReference from './reference/cli-reference.mdx';
import ReferenceDeployment from './reference/deployment.mdx';
import ReferenceEcoNamespace from './reference/eco-namespace.mdx';
import ServerApiHandlers from './server/api-handlers.mdx';
import ServerCaching from './server/caching.mdx';
import ServerDefineHandlers from './server/define-handlers.mdx';
import ServerExplicitRouting from './server/explicit-routing.mdx';
import ServerRoutingPatterns from './server/routing-patterns.mdx';
import ServerServerApi from './server/server-api.mdx';
import ServerWebsockets from './server/websockets.mdx';

/** Docs navigation, metadata, icons, and MDX modules — single source of truth. */
export const docsSiteContent = attachDocsContentModules(docsSiteContentMeta, {
	'core/architecture': CoreArchitecture,
	'core/build-and-host': CoreBuildAndHost,
	'core/components': CoreComponents,
	'core/concepts': CoreConcepts,
	'core/data-fetching': CoreDataFetching,
	'core/hmr': CoreHmr,
	'core/includes': CoreIncludes,
	'core/layouts': CoreLayouts,
	'core/pages': CorePages,
	'core/plugin-lifecycle': CorePluginLifecycle,
	'core/request-locals': CoreRequestLocals,
	'core/routing': CoreRouting,
	'ecosystem/browser-router': EcosystemBrowserRouter,
	'ecosystem/ecopages': EcosystemEcopages,
	'ecosystem/file-system': EcosystemFileSystem,
	'ecosystem/image-processor': EcosystemImageProcessor,
	'ecosystem/packages': EcosystemPackages,
	'ecosystem/postcss-processor': EcosystemPostcssProcessor,
	'ecosystem/radiant': EcosystemRadiant,
	'ecosystem/react-router': EcosystemReactRouter,
	'ecosystem/vite-plugin': EcosystemVitePlugin,
	'getting-started/configuration': GettingStartedConfiguration,
	'getting-started/installation': GettingStartedInstallation,
	'getting-started/introduction': GettingStartedIntroduction,
	'integrations/ecopages-jsx': IntegrationsEcopagesJsx,
	'integrations/kitajs': IntegrationsKitajs,
	'integrations/lit': IntegrationsLit,
	'integrations/mdx': IntegrationsMdx,
	'integrations/overview': IntegrationsOverview,
	'integrations/react': IntegrationsReact,
	'plugins/custom-integration': PluginsCustomIntegration,
	'plugins/custom-processor': PluginsCustomProcessor,
	'plugins/source-transforms': PluginsSourceTransforms,
	'plugins/overview': PluginsOverview,
	'reference/cli-reference': ReferenceCliReference,
	'reference/deployment': ReferenceDeployment,
	'reference/eco-namespace': ReferenceEcoNamespace,
	'server/api-handlers': ServerApiHandlers,
	'server/caching': ServerCaching,
	'server/define-handlers': ServerDefineHandlers,
	'server/explicit-routing': ServerExplicitRouting,
	'server/routing-patterns': ServerRoutingPatterns,
	'server/server-api': ServerServerApi,
	'server/websockets': ServerWebsockets,
}) satisfies DocsSiteContent;

export { docsSiteContentMeta } from './content.meta';
