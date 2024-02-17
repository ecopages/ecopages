import { LiteElement, onEvent, querySelector } from "@/lib/lite";
import { LiteContext, provider, subscribe } from "@/lib/lite/context";
import { customElement } from "lit/decorators.js";
import {
  litePackageContext,
  type LitePackageContextType,
} from "../lite-package-context/lite-package-context.script";

export type LitePkgConsumerProps = {
  "context-id": string;
};

@customElement("lite-package-consumer")
export class LitePackageConsumer extends LiteElement {
  @querySelector("[data-name]") packageName!: HTMLSpanElement;
  @querySelector("[data-version]") packageVersion!: HTMLSpanElement;

  @provider<LitePackageContextType>(litePackageContext)
  packageContext!: LiteContext<LitePackageContextType>;

  @subscribe({ context: litePackageContext, selector: "name" })
  updateName({ name }: { name: string }) {
    this.packageName.innerHTML = name;
  }

  @subscribe({ context: litePackageContext, selector: "version" })
  updateVersion({ version }: { version: string }) {
    this.packageVersion.innerHTML = version;
  }

  @onEvent({ target: "form", type: "submit" })
  handleFormSubmit(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const key = form.querySelector<HTMLSelectElement>("[data-options]")?.value;
    const value = form.querySelector<HTMLInputElement>("[data-input]")?.value;
    this.packageContext.setState({ [key as string]: value });
    form.reset();
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-package-consumer": HtmlTag & LitePkgConsumerProps;
    }
  }
}
