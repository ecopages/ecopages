import { customElement } from "@/lib/lite/decorators/custom-element";
import { LiteElement } from "@/lib/lite/LiteElement";
import { onEvent } from "@/lib/lite/decorators/on-event";
import { querySelector } from "@/lib/lite/decorators/query-selector";
import { LiteContext } from "@/lib/lite/context/lite-context";
import { contextProvider } from "@/lib/lite/context/decorators/context-provider";
import { useContext } from "@/lib/lite/context/decorators/use-context";
import {
  litePackageContext,
  type LitePackageContextType,
} from "../lite-package-context/lite-package-context.script";

@customElement("lite-package-consumer")
export class LitePackageConsumer extends LiteElement {
  @querySelector("[data-name]") packageName!: HTMLSpanElement;
  @querySelector("[data-version]") packageVersion!: HTMLSpanElement;

  @contextProvider<LitePackageContextType>(litePackageContext)
  packageContext!: LiteContext<LitePackageContextType>;

  @useContext({ context: litePackageContext, selector: "name" })
  updateName({ name }: { name: string }) {
    this.packageName.innerHTML = name;
  }

  @useContext({ context: litePackageContext, selector: "version" })
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
      "lite-package-consumer": HtmlTag;
    }
  }
}
