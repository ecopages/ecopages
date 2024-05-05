import { deepMerge } from '@/utils/deep-merge';
import type { EcoComponentDependencies, IntegrationPlugin } from '@eco-pages/core';
import { createElement } from 'react';
import { preload } from 'react-dom';
import { ReactRenderer } from './react-renderer';

export type ReactPluginOptions = {
  extensions?: string[];
  dependencies?: IntegrationPlugin['dependencies'];
};

export function reactPlugin(options?: ReactPluginOptions): IntegrationPlugin {
  const { extensions = ['.tsx'], dependencies = [] } = options || {};
  return {
    name: 'react',
    extensions,
    renderer: ReactRenderer,
    dependencies,
  };
}

export function DynamicHead({ dependencies }: { dependencies?: EcoComponentDependencies }) {
  if (!dependencies) return;

  const elements: JSX.Element[] = [];

  if (dependencies.stylesheets?.length) {
    for (const stylesheet of dependencies.stylesheets) {
      elements.push(createElement('link', { key: stylesheet, rel: 'stylesheet', href: stylesheet, as: 'style' }));
    }
  }
  if (dependencies.scripts?.length) {
    for (const script of dependencies.scripts) {
      elements.push(createElement('script', { key: script, defer: true, type: 'module', src: script }));
    }
  }

  return elements;
}
