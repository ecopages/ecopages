import type { Conditions, OnDataLoadedEvent, ScriptInjectorProps } from './types';

export enum ScriptInjectorEvents {
  DATA_LOADED = 'data-loaded',
}

export const conditions = ['on:visible', 'on:idle', 'on:interaction'] as const;

export class ScriptsInjector extends HTMLElement {
  private _intersectionObserver?: IntersectionObserver | null = null;
  private _scriptsToLoad: string[] = [];
  private registeredEvents: { type: string; listener: EventListener }[] = [];
  private conditionsMap: Record<string, () => void> = {
    visible: this._onVisible.bind(this),
    idle: this._onIdle.bind(this),
    interaction: this._onInteraction.bind(this),
  };

  constructor() {
    super();
    this._loadScripts = this._loadScripts.bind(this);
    this._listenToDataLoaded = this._listenToDataLoaded.bind(this);
  }

  connectedCallback() {
    this._scriptsToLoad = this.getAttribute('scripts')?.split(',') || [];
    document.addEventListener(ScriptInjectorEvents.DATA_LOADED, this._listenToDataLoaded);
    this._applyConditions();
  }

  disconnectedCallback() {
    this._unregisterEvents();
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
    }
  }

  _notifyInjectors() {
    document.dispatchEvent(
      new CustomEvent(ScriptInjectorEvents.DATA_LOADED, {
        detail: { loadedScripts: this._scriptsToLoad },
      }),
    );
  }

  private _applyConditions() {
    const conditions = Object.keys(this.conditionsMap) as Conditions[];
    for (const condition of conditions) {
      if (this.hasAttribute(`on:${condition}`)) {
        this.conditionsMap[condition as Conditions]();
      }
    }
  }

  private _onVisible() {
    return this._setupIntersectionObserver();
  }

  private _onIdle() {
    return this._loadScripts();
  }

  private _onInteraction() {
    const interaction = this.getAttribute('on:interaction') as ScriptInjectorProps['on:interaction'];

    if (!interaction) return;

    for (const event of interaction.split(',')) {
      this.addEventListener(event, this._loadScripts);
      this.registeredEvents.push({ type: event, listener: this._loadScripts });
    }
  }

  private _listenToDataLoaded(event: Event) {
    if (this.hasAttribute('data-loaded')) return;
    const { loadedScripts } = (event as OnDataLoadedEvent).detail;
    this._scriptsToLoad = this._scriptsToLoad.filter((script) => !loadedScripts.includes(script));
    if (this._scriptsToLoad.length === 0) {
      this.setAttribute('data-loaded', '');
      this._unregisterEvents();
    }
  }

  private _unregisterEvents() {
    document.dispatchEvent(
      new CustomEvent(ScriptInjectorEvents.DATA_LOADED, {
        detail: { loadedScripts: this._scriptsToLoad },
      }),
    );
    this._intersectionObserver?.disconnect();

    for (const { type, listener } of this.registeredEvents) {
      this.removeEventListener(type, listener);
    }
  }

  private _loadScripts() {
    try {
      for (const script of this._scriptsToLoad) {
        this._loadScript(script);
      }
    } catch (error) {
      console.error('Error loading scripts', error);
    } finally {
      this.setAttribute('data-loaded', '');
      this._unregisterEvents();
      this._notifyInjectors();
    }
  }

  private _loadScript(scriptToLoad: string) {
    const script = document.createElement('script');
    script.src = scriptToLoad;
    script.type = 'module';
    document.head.appendChild(script);
  }

  private _setupIntersectionObserver() {
    const options: IntersectionObserverInit = {
      rootMargin: '50px   0px',
      threshold: 0.1,
    };

    this._intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this._loadScripts();
        }
      }
    }, options);

    this._intersectionObserver.observe(this);
  }
}

customElements.define('scripts-injector', ScriptsInjector);
