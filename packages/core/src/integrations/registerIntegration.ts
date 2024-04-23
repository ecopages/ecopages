import type { IntegrationRenderer } from '@/route-renderer/integration-renderer';
import { appLogger } from '@/utils/app-logger';

export type IntegrationPlugin = {
  name: string;
  renderer: typeof IntegrationRenderer;
  scriptsToInject?: string[];
};

export const registerIntegration = (plugin: IntegrationPlugin) => {
  if (globalThis.ecoConfig.integrations[plugin.name]) appLogger.error(`Integration ${plugin.name} already registered`);
  globalThis.ecoConfig.integrations[plugin.name] = plugin;
  appLogger.debug(`Integration ${plugin.name} registered`);
};
