import { getComponentConfig } from "root/lib/component-utils/get-component-config";
import { BaseLayout } from "./base-layout.kita";

export type { BaseLayoutProps } from "./base-layout.kita";

export default getComponentConfig({
  template: BaseLayout,
  importMeta: import.meta,
  deps: ["stylesheet"],
});
