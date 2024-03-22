import { DepsManager } from "@eco-pages/core";
import { type ScriptInjectorProps } from "./script-injector.script";

export function ScriptInjector({
  children,
  ...props
}: ScriptInjectorProps & { children?: Html.Children; class?: string }) {
  return <script-injector {...props}>{children}</script-injector>;
}

ScriptInjector.dependencies = DepsManager.collect({ importMeta: import.meta });
