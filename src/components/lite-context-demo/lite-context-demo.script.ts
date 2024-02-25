import { LiteElement } from "@/lib/lite/LiteElement";
import { contextProvider } from "@/lib/lite/context/decorators/context-provider";
import { useContext } from "@/lib/lite/context/decorators/use-context";
import { LiteContext } from "@/lib/lite/context/lite-context";
import { createContext, type Context } from "@/lib/lite/context/types";
import { customElement } from "@/lib/lite/decorators/custom-element";
import { onEvent } from "@/lib/lite/decorators/on-event";
import { querySelector } from "@/lib/lite/decorators/query-selector";

class Logger {
  log(message: string) {
    console.log(`%cLOGGER`, "background: #222; color: #bada55", message);
  }
}

export const liteContextDemo = createContext("lc-demo", {
  name: "eco-pages",
  version: 0.1,
  templateSupport: ["kita"],
  logger: new Logger(),
  plugins: {
    "lit-light": true,
    alpinejs: true,
    "lit-ssr": false,
  },
});

@customElement("lc-demo")
export class LiteContextDemo extends LiteContext<typeof liteContextDemo> {
  override name = liteContextDemo.name;
  override context = liteContextDemo.initialValue!;
}

@customElement("lc-demo-visualizer")
export class LitePackageVisualizer extends LiteElement {
  @querySelector("[data-name]") packageName!: HTMLSpanElement;
  @querySelector("[data-version]") packageVersion!: HTMLSpanElement;

  @useContext({ context: liteContextDemo, selector: "name" })
  updateName({ name }: { name: string }) {
    this.packageName.innerHTML = name;
  }

  @useContext({ context: liteContextDemo, selector: "version" })
  updateVersion({ version }: { version: string }) {
    this.packageVersion.innerHTML = version;
  }
}

@customElement("lc-demo-editor")
export class LitePackageConsumer extends LiteElement {
  @contextProvider<typeof liteContextDemo>(liteContextDemo)
  context!: LiteContext<typeof liteContextDemo>;

  @onEvent({ target: "[data-options]", type: "change" })
  updateInputType(event: Event) {
    const select = event.target as HTMLSelectElement;
    const input = this.querySelector<HTMLInputElement>("[data-input]")!;
    input.type = select.value === "version" ? "number" : "text";
  }

  @onEvent({ target: "form", type: "submit" })
  handleFormSubmit(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const key = form.querySelector<HTMLSelectElement>("[data-options]")?.value!;
    const value = form.querySelector<HTMLInputElement>("[data-input]")?.value!;
    this.context.setContext({ [key]: value });
    this.context.getContext().logger.log(`Updated ${key} to ${value}`);
    form.reset();
  }
}
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lc-demo": HtmlTag;
      "lc-demo-visualizer": HtmlTag;
      "lc-demo-editor": HtmlTag;
    }
  }
}
