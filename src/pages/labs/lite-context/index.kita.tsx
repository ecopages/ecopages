import { DepsManager, type EcoComponent } from "@eco-pages/core";
import { BaseLayout } from "@/layouts/base-layout";
import { LitePkgContext } from "@/components/lite-pkg-context";
import { LitePkgConsumer } from "@/components/lite-pkg-consumer";
import { codeToHtml } from "shiki";

const code = `
/* -------------------------------------------------------------- *
 * ----------------------- LITE ELEMENT ------------------------- *
 * -------------------------------------------------------------- *

Lite Element is a lightweight web component library that provides a simple way to create and manage stateful and reactive components.
It is built on top of the Web Components standard and currently use LitElement as the base class for creating components.
Instead of using the shadow DOM, Lite Element is a bare-bones implementation of web components that uses the light DOM.
This means that Lite Element components are not isolated from the rest of the page and can be styled and manipulated using regular CSS and JavaScript.

This goes against the 'official' best practices of web components, but it is a trade-off that allows for a simpler and more flexible development experience.
Lite Element is designed to be used in small to medium-sized projects where the overhead of a full web components implementation is not justified.
Lite Element is not a replacement for full web components, but rather a lightweight alternative for projects that do not require the full power of the web components standard.

https://web.dev/articles/custom-elements-best-practices

Another problem related to web components is the possibility to SSR them.
This is a problem that is being addressed by the community and there are some libraries that are trying to solve it.
One of them is @lit-labs/ssr, which is a library that allows you to server-side render lit-html templates.
This is a great solution for web components, but it is not a perfect solution for all use cases and it still has some limitations and issues.
Lite Element is a lightweight alternative that allows you to create server-side rendered components without the need for a full web components implementation.

* --------------------------------------------------------------- *
* --------------------- Utility decorators ---------------------- *
* -------------------------------------------------------------- */

/* ----------------- @onEvent decorator ------------------------- *
  * This is a decorator that allows you to register event listeners 
  * on the element. It takes an options object with the target and 
  * type of the event and a method to call when the event is fired.
  * -------------------------------------------------------------- */

@onEvent({ target: "[data-target]", type: "click" })
doSomething() {...}

/* ----------------- @querySelector decorator -------------------- *
  * This is a decorator that allows you to query for an element 
  * inside the component tree. It takes a selector and a property to 
  * assign the element to. Behind the scenes, it uses querySelector
  * -------------------------------------------------------------- */

@querySelector("[data-text]") countText!: HTMLElement;
myText: string

/* ----------------- @querySelectorAll decorator -------------------- *
  * This is a decorator that allows you to query for elements 
  * inside the component tree. It takes a selector and a property to 
  * assign the element to. Behind the scenes, it uses querySelectorAll
  * -------------------------------------------------------------- */

@querySelector("[data-text]") countText!: HTMLElement;
myNotes: string[]

/* ----------------- @onUpdated decorator ----------------------- *
  * This is a decorator that allows you to register a method to 
  * be called when a property is updated. It takes the name of 
  * the property to watch for changes.
  * -------------------------------------------------------------- */

@onUpdated("count")
doSomething() {...}

/* --------------------- Example: Counter ----------------------- */

@customElement("lite-counter")
export class LiteCounter extends LiteElement {
  @property({ type: Number }) count = 0;
  @querySelector("[data-text]") countText!: HTMLElement;

  @onEvent({ target: "[data-decrement]", type: "click" })
  decrement() {
    this.count--;
  }

  @onEvent({ target: "[data-increment]", type: "click" })
  increment() {
    this.count++;
  }

  @onUpdated("count")
  updateCount() {
    this.countText.textContent = this.count.toString();
  }
}

/* -------------------------------------------------------------- *
  * ------------------- LITE CONTEXT PROVIDER -------------------- *
  * ------------------------------------------------------------- */

Lite Context is a lightweight state management class that is built on top of Lite Element.
It provides a simple way to create and manage data and methods that can be shared across the application.

To be able to use the Lite Context, you need to create a new class that extends the LiteContext class and define the state of the context.

Then you can wrap your components in the context provider and use the a set of utility decorators to register a subscription or use the context.


/* ------------------- Example: LiteContext -------------------- */

export type MyContextState = {
  name: string;
  version: number;
};

@customElement("lite-my-context")
export class LitePkgContext extends LiteContext<MyContextState> {
  @state() protected override state = {
    name: "eco-pages",
    version: 0.1,
  };
}

/* ---------------------- Example: Markup ---------------------- */

<lite-my-context context-id="my-context-id">
  <lite-my-consumer context-id="my-context-id"></lite-my-consumer>
</lite-my-context>

/* -------------------------------------------------------------- *
  * ------------------- LITE CONTEXT CONSUMER -------------------- *
  * ------------------------------------------------------------- */

/* -------------------- @subscribe decorator --------------------- *
  * This is the easiest way to register a subscription to a context 
  * It will check if a context has been already found and if not 
  * it will look for it and register the subscription
  * -------------------------------------------------------------- */

@subscribe({ contextId: "eco-pages", selector: "name" })
updateName({ name }: { name: string }) {
  this.packageName.innerHTML = name;
}

/* -------------------- @provider decorator ---------------------- *
  * This is how you can get the full context where the element is wrapped in 
  * It will walk up the DOM tree to find the closest context with the given id
  * -------------------------------------------------------------- */

@provider<LitePkgContextStateProps>("eco-pages")
context!: LiteContext<LitePkgContextStateProps>;

/* -------------------- Manual Subscriptions ---------------------- *
  * This is how you can subscribe to a context change manually, without decorators
  * --------------------------------------------------------------- */

connectedCallback(): void {
  super.connectedCallback();
  
  this.context = this.closest(\`lite-pkg-context[context-id="$\{contextId}"]\`) as LiteContext<ContextState> | null;
  if (!this.context) throw new Error(\`No context found with id: \${contextId}\`);

  this.context.subscribe({
    selector: "name",
    callback: ({ name }) => {
      this.packageName.innerHTML = name;
    },
  });
}
  `;

const safeHtml = await codeToHtml(code, {
  lang: "typescript",
  theme: "vitesse-dark",
});

export const metadata = {
  title: "Lite Element",
  description: "Testing lite element with Kita",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static", "lite-element"],
};

const dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout, LitePkgContext, LitePkgConsumer],
});

const CONTEXT_ID = "eco-pages";

const LiteElement: EcoComponent = () => {
  return (
    <BaseLayout class="main-content">
      <LitePkgContext contextId={CONTEXT_ID} class="grid grid-cols-2 gap-4">
        <>
          <LitePkgConsumer contextId={CONTEXT_ID} />
          <LitePkgConsumer contextId={CONTEXT_ID} />
        </>
      </LitePkgContext>
      <div class="my-8 rounded-md grid grid-cols-6 [&_pre.shiki]:col-span-4 [&_pre.shiki]:col-start-2 [&_pre.shiki]:whitespace-pre-wrap [&_pre.shiki]:px-4 [&_pre.shiki]:rounded-md">
        {safeHtml}
      </div>
    </BaseLayout>
  );
};

LiteElement.dependencies = dependencies;

export default LiteElement;
