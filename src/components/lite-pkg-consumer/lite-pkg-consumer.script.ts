import { LiteElement, onEvent, querySelector } from "@/lib/lite";
import { LiteContext, provider, subscribe } from "@/lib/lite/context";
import { customElement } from "lit/decorators.js";
import type { LitePkgContextStateProps } from "../lite-pkg-context/lite-pkg-context.script";

export type LitePkgConsumerProps = {
  "context-id": string;
};

@customElement("lite-pkg-consumer")
export class LitePkgConsumer extends LiteElement {
  @querySelector("[data-name]") packageName!: HTMLSpanElement;
  @querySelector("[data-version]") packageVersion!: HTMLSpanElement;

  @provider<LitePkgContextStateProps>("eco-pages")
  context!: LiteContext<LitePkgContextStateProps>;

  @subscribe({ contextId: "eco-pages", selector: "name" })
  updateName({ name }: { name: string }) {
    this.packageName.innerHTML = name;
  }

  @subscribe({ contextId: "eco-pages", selector: "version" })
  updateVersion({ version }: { version: string }) {
    this.packageVersion.innerHTML = version;
  }

  @onEvent({ target: "form", type: "submit" })
  handleFormSubmit(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const key = form.querySelector<HTMLSelectElement>("[data-options]")?.value;
    const value = form.querySelector<HTMLInputElement>("[data-input]")?.value;
    this.context.setState({ [key as string]: value });
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-pkg-consumer": HtmlTag & LitePkgConsumerProps;
    }
  }
}
