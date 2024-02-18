import type { LiteElement } from "../LiteElement";
import "@kitajs/html/register.js";

type Constructor<T> = new (...args: any[]) => T;

interface WithKitaMixin {
  renderTemplate: (props: {
    target: HTMLElement;
    template: JSX.Element | string;
    mode: "replace" | "beforeend" | "afterbegin";
  }) => Promise<void>;
}
export function WithKita<T extends Constructor<LiteElement>>(
  Base: T
): T & Constructor<WithKitaMixin> {
  return class extends Base implements WithKitaMixin {
    override async renderTemplate({
      target = this,
      template,
      mode = "replace",
    }: {
      target: HTMLElement;
      template: JSX.Element | string;
      mode: "replace" | "beforeend" | "afterbegin";
    }) {
      const safeTemplate = typeof template !== "string" ? template.toString() : template;
      switch (mode) {
        case "replace":
          target.innerHTML = safeTemplate;
          break;
        case "beforeend":
          target.insertAdjacentHTML("beforeend", safeTemplate);
          break;
        case "afterbegin":
          target.insertAdjacentHTML("afterbegin", safeTemplate);
          break;
      }
    }
  } as T & Constructor<WithKitaMixin>;
}
