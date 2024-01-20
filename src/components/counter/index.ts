import { getComponentConfig } from "root/lib/component-utils/get-component-config";
import { Counter } from "./counter.kita";

export default getComponentConfig({
  template: Counter,
  importMeta: import.meta,
});
