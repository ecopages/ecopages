import { getComponentConfig } from "root/lib/component-utils/get-component-config";
import { BaseLayout, type BaseLayoutProps } from "./base-layout.kita";

export type { BaseLayoutProps } from "./base-layout.kita";

export default getComponentConfig<BaseLayoutProps>({
  template: BaseLayout,
  importMeta: import.meta,
});
