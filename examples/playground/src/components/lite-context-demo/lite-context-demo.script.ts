import { LiteElement } from '@/lib/lite/LiteElement';
import { contextProvider } from '@/lib/lite/context/decorators/context-provider';
import { useContext } from '@/lib/lite/context/decorators/use-context';
import { LiteContext } from '@/lib/lite/context/lite-context';
import { type ContextType, createContext } from '@/lib/lite/context/types';
import { customElement } from '@/lib/lite/decorators/custom-element';
import { onEvent } from '@/lib/lite/decorators/on-event';
import { querySelector } from '@/lib/lite/decorators/query-selector';

class Logger {
  log(message: string) {
    console.log('%cLOGGER', 'background: #222; color: #bada55', message);
  }
}

export const liteContextDemo = createContext('lc-demo', {
  name: 'eco-pages',
  version: 0.1,
  templateSupport: ['kita'],
  logger: new Logger(),
  plugins: {
    'lit-light': true,
    alpinejs: true,
    'lit-ssr': false,
  },
});

@customElement('lc-demo')
export class LiteContextDemo extends LiteContext<typeof liteContextDemo> {
  override name = liteContextDemo.name;
  override context = liteContextDemo.initialValue as ContextType<typeof liteContextDemo>;
}

@customElement('lc-demo-visualizer')
export class LitePackageVisualizer extends LiteElement {
  @querySelector('[data-name]') packageName!: HTMLSpanElement;
  @querySelector('[data-version]') packageVersion!: HTMLSpanElement;

  @useContext({ context: liteContextDemo, selector: 'name' })
  updateName({ name }: { name: string }) {
    this.packageName.innerHTML = name;
  }

  @useContext({ context: liteContextDemo, selector: 'version' })
  updateVersion({ version }: { version: string }) {
    this.packageVersion.innerHTML = version;
  }
}

@customElement('lc-demo-editor')
export class LitePackageConsumer extends LiteElement {
  @querySelector('[data-input]') input!: HTMLInputElement;
  @querySelector('[data-options]') select!: HTMLSelectElement;

  @contextProvider<typeof liteContextDemo>(liteContextDemo)
  context!: LiteContext<typeof liteContextDemo>;

  declare logger: Logger;

  override connectedContextCallback(contextName: string) {
    if (contextName !== liteContextDemo.name) return;
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
