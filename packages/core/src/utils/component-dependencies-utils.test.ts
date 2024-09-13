import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { FIXTURE_APP_BASE_URL, FIXTURE_APP_PROJECT_DIR } from '../../fixtures/constants.ts';
import { ConfigBuilder } from '../main/config-builder.ts';
import type { EcoComponentDependencies } from '../public-types.ts';
import { removeComponentsScripts, resolveComponentsScripts } from './component-dependencies-utils.ts';

await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).setBaseUrl(FIXTURE_APP_BASE_URL).build();

const baseComponentUrl = path.join(globalThis.ecoConfig.srcDir, globalThis.ecoConfig.componentsDir);

const createComponentUrl = (componentName: string) => path.join(baseComponentUrl, componentName);

const componentsMock: Required<EcoComponentDependencies>['components'] = [
  {
    config: {
      importMeta: {
        dir: createComponentUrl('component1'),
      } as ImportMeta,
      dependencies: {
        scripts: ['script1.ts', 'script2.ts'],
        stylesheets: ['style1.css'],
      },
    },
  },

  {
    config: {
      importMeta: {
        dir: createComponentUrl('component2'),
      } as ImportMeta,
      dependencies: {
        scripts: ['script3.ts'],
        stylesheets: ['style2.css'],
      },
    },
  },
];

describe('component-dependencies-utils', () => {
  describe('resolveComponentsScripts', () => {
    it('should resolve the scripts of the components dependencies', () => {
      const result = resolveComponentsScripts(componentsMock);
      expect(result).toEqual(
        '/components/component1/script1.js,/components/component1/script2.js,/components/component2/script3.js',
      );
    });
  });

  describe('removeComponentsScripts', () => {
    it('should remove the scripts from the components dependencies', () => {
      const result = removeComponentsScripts(componentsMock);
      expect(result).toEqual(
        componentsMock.map((component) => {
          if (!component.config?.dependencies) {
            return component;
          }
          const { scripts, ...otherDependencies } = component.config.dependencies;
          return {
            ...component,
            config: {
              ...component.config,
              dependencies: otherDependencies,
            },
          };
        }),
      );
    });
  });
});
