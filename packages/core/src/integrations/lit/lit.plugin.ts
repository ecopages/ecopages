import type { IntegrationPlugin } from '../registerIntegration';
import { LitRenderer } from './lit-renderer';

export const litPlugin: IntegrationPlugin = {
  name: 'lit',
  renderer: LitRenderer,
  scriptsToInject: ['@lit-labs/ssr-client/lit-element-hydrate-support.js'],
};
