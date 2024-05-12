import {
  type LiteContext,
  LiteElement,
  consumeContext,
  contextSelector,
  createContext,
  customElement,
  onEvent,
  provideContext,
  querySelector,
} from '@eco-pages/lite-elements';

class Logger {
  log(message: string) {
    console.log('%cLOGGER', 'background: #222; color: #bada55', message);
  }
}

type LiteContextDemoContext = {
  name: string;
  version: string;
  templateSupport: string[];
  logger: Logger;
  plugins: Record<string, boolean>;
};

export const liteContextDemo = createContext<LiteContextDemoContext>(Symbol('liteContextDemo'));

const initialValue: LiteContextDemoContext = {
  name: 'eco-pages',
  version: '0.1',
  templateSupport: ['kita'],
  logger: new Logger(),
  plugins: { 'lit-light': true, alpinejs: true, 'lit-ssr': true },
};

@customElement('lc-demo')
export class LiteContextDemo extends LiteElement {
  @provideContext({ context: liteContextDemo, initialValue })
  context!: LiteContext<typeof liteContextDemo>;
}

@customElement('lc-demo-visualizer')
export class LitePackageVisualizer extends LiteElement {
  @querySelector('[data-name]') packageName!: HTMLSpanElement;
  @querySelector('[data-version]') packageVersion!: HTMLSpanElement;

  @contextSelector({ context: liteContextDemo, select: ({ name }) => ({ name }) })
  updateName({ name }: { name: string }) {
    this.packageName.innerHTML = name;
  }

  @contextSelector({ context: liteContextDemo, select: ({ version }) => ({ version }) })
  updateVersion({ version }: { version: string }) {
    this.packageVersion.innerHTML = version;
  }
}

@customElement('lc-demo-editor')
export class LitePackageConsumer extends LiteElement {
  @querySelector('[data-input]') input!: HTMLInputElement;
  @querySelector('[data-options]') select!: HTMLSelectElement;

  @consumeContext(liteContextDemo)
  context!: LiteContext<typeof liteContextDemo>;

  declare logger: Logger;

  override connectedContextCallback(_contextName: typeof liteContextDemo): void {
    this.logger = this.context.getContext().logger;
  }

  @onEvent({ target: '[data-options]', type: 'change' })
  updateInputType() {
    this.input.type = this.select.value === 'version' ? 'number' : 'text';
    this.input.type === 'number' ? this.input.setAttribute('step', '0.01') : this.input.removeAttribute('step');
  }

  @onEvent({ target: 'form', type: 'submit' })
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
