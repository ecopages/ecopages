import type { Conditions, OnDataLoadedEvent, ScriptInjectorProps } from './types';

export enum ScriptInjectorEvents {
  DATA_LOADED = 'data-loaded',
}

export const conditions = ['on:visible', 'on:idle', 'on:interaction'] as const;

export class ScriptsInjector extends HTMLElement {
  private intersectionObserver?: IntersectionObserver | null = null;
  private scriptsToLoad: string[] = [];
  private registeredEvents: { type: string; listener: EventListener }[] = [];
  private conditionsMap: Record<string, () => void> = {
    visible: this.onVisible.bind(this),
    idle: this.onIdle.bind(this),
    interaction: this.onInteraction.bind(this),
  };

  constructor() {
    super();
    this.loadScripts = this.loadScripts.bind(this);
    this.listenToDataLoaded = this.listenToDataLoaded.bind(this);
  }

  connectedCallback() {
    this.scriptsToLoad = this.getAttribute('scripts')?.split(',') || [];
    document.addEventListener(ScriptInjectorEvents.DATA_LOADED, this.listenToDataLoaded);
    this.applyConditions();
  }

  disconnectedCallback() {
    this.unregisterEvents();
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  private notifyInjectors() {
    document.dispatchEvent(
      new CustomEvent(ScriptInjectorEvents.DATA_LOADED, {
        detail: { loadedScripts: this.scriptsToLoad },
      }),
    );
  }

  private applyConditions() {
    const conditions = Object.keys(this.conditionsMap) as Conditions[];
    for (const condition of conditions) {
      if (this.hasAttribute(`on:${condition}`)) {
        this.conditionsMap[condition as Conditions]();
      }
    }
  }

  private onVisible() {
    return this.setupIntersectionObserver();
  }

  private onIdle() {
    return this.loadScripts();
  }

  private onInteraction() {
    const interaction = this.getAttribute('on:interaction') as ScriptInjectorProps['on:interaction'];

    if (!interaction) return;

    for (const event of interaction.split(',')) {
      this.addEventListener(event, this.loadScripts);
      this.registeredEvents.push({ type: event, listener: this.loadScripts });
    }
  }

  private listenToDataLoaded(event: Event) {
    if (this.hasAttribute('data-loaded')) return;
    const { loadedScripts } = (event as OnDataLoadedEvent).detail;
    this.scriptsToLoad = this.scriptsToLoad.filter((script) => !loadedScripts.includes(script));
    if (this.scriptsToLoad.length === 0) {
      this.setAttribute('data-loaded', '');
      this.unregisterEvents();
    }
  }

  private unregisterEvents() {
    document.dispatchEvent(
      new CustomEvent(ScriptInjectorEvents.DATA_LOADED, {
        detail: { loadedScripts: this.scriptsToLoad },
      }),
    );
    this.intersectionObserver?.disconnect();

    for (const { type, listener } of this.registeredEvents) {
      this.removeEventListener(type, listener);
    }
  }

  private loadScripts() {
    try {
      for (const script of this.scriptsToLoad) {
        this.loadScript(script);
      }
    } catch (error) {
      console.error('Error loading scripts', error);
    } finally {
      this.setAttribute('data-loaded', '');
      this.unregisterEvents();
      this.notifyInjectors();
    }
  }

  private loadScript(scriptToLoad: string) {
    const script = document.createElement('script');
    script.src = scriptToLoad;
    script.type = 'module';
    document.head.appendChild(script);
  }

  private setupIntersectionObserver() {
    const options: IntersectionObserverInit = {
      rootMargin: '50px   0px',
      threshold: 0.1,
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.loadScripts();
        }
      }
    }, options);

    this.intersectionObserver.observe(this);
  }
}

customElements.define('scripts-injector', ScriptsInjector);
