import {
  type ContextProvider,
  LiteElement,
  consumeContext,
  contextSelector,
  createContext,
  customElement,
  onEvent,
  provideContext,
  query,
} from '@ecopages/radiant';

class Logger {
  log(message: string) {
    console.log('%cLOGGER', 'background: #222; color: #bada55', message);
  }
}

type ContextProviderDemoContext = {
  name: string;
  version: string;
  templateSupport: string[];
  logger: Logger;
  plugins: Record<string, boolean>;
};

export const contextDemo = createContext<ContextProviderDemoContext>(Symbol('ContextProviderDemo'));

const initialValue: ContextProviderDemoContext = {
  name: 'ecopages',
  version: '0.1',
  templateSupport: ['kita'],
  logger: new Logger(),
  plugins: { 'lit-light': true, alpinejs: true, 'lit-ssr': true },
};

@customElement('lc-demo')
export class ContextProviderDemo extends LiteElement {
  @provideContext({ context: contextDemo, initialValue })
  context!: ContextProvider<typeof contextDemo>;
}

@customElement('lc-demo-visualizer')
export class LitePackageVisualizer extends LiteElement {
  @query({ selector: '[data-name]' }) packageName!: HTMLSpanElement;
  @query({ selector: '[data-version]' }) packageVersion!: HTMLSpanElement;

  @contextSelector({ context: contextDemo, select: ({ name }) => ({ name }) })
  updateName({ name }: { name: string }) {
    this.packageName.innerHTML = name;
  }

  @contextSelector({ context: contextDemo, select: ({ version }) => ({ version }) })
  updateVersion({ version }: { version: string }) {
    this.packageVersion.innerHTML = version;
  }
}

@customElement('lc-demo-editor')
export class LitePackageConsumer extends LiteElement {
  @query({ selector: '[data-input]' }) input!: HTMLInputElement;
  @query({ selector: '[data-options]' }) select!: HTMLSelectElement;

  @consumeContext(contextDemo)
  context!: ContextProvider<typeof contextDemo>;

  declare logger: Logger;

  override connectedContextCallback(_contextName: typeof contextDemo): void {
    this.logger = this.context.getContext().logger;
  }

  @onEvent({ selector: '[data-options]', type: 'change' })
  updateInputType() {
    this.input.type = this.select.value === 'version' ? 'number' : 'text';
    this.input.type === 'number' ? this.input.setAttribute('step', '0.01') : this.input.removeAttribute('step');
  }

  @onEvent({ selector: 'form', type: 'submit' })
  handleFormSubmit(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const key = this.select.value;
    const value = this.input.value;
    this.context.setContext({ [key]: value });
    this.logger.log(`Updated ${key} to ${value}`);
    this.updateInputType();
    form.reset();
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lc-demo': HtmlTag;
      'lc-demo-visualizer': HtmlTag;
      'lc-demo-editor': HtmlTag;
    }
  }
}
