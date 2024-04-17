import { DepsManager } from '@eco-pages/core';
import type { ScriptInjectorProps } from './script-injector.script';

export function ScriptInjector({
  children,
  ...props
}: ScriptInjectorProps & { children?: Html.Children; class?: string }) {
  return <script-injector {...props}>{children}</script-injector>;
}

ScriptInjector.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  scripts: ['./script-injector.script.ts'],
});
