import { customElement } from "@/lib/lite/decorators/custom-element";

export type ScriptInjectorProps = {
  /**
   * @description Load the script once the dom is ready
   * @example <script-injector on:idle></script-injector>
   */
  ["on:idle"]?: boolean;
  /**
   * @description Load the script based on a series of events
   * @example <script-injector on:interaction="mouseenter, focusin"></script-injector>
   */
  ["on:interaction"]?: "touchstart,click" | "mouseenter,focusin";
  /**
   * @description Import a script to be loaded when the observer detects the element is in the viewport
   * @example <script-injector on:visible="50px 1px"></script-injector>
   */
  ["on:visible"]?: string | boolean;
  /**
   * A list of scripts to be loaded, comma separated.
   */
  scripts: string;
};

enum ScriptInjectorEvents {
  DATA_LOADED = "data-loaded",
}

type OnDataLoadedEvent = CustomEvent<{ loadedScripts: string[] }>;

const conditions = ["on:visible", "on:idle", "on:interaction"] as const;

type Conditions = (typeof conditions)[number];

@customElement("script-injector")
class ScriptInjector extends HTMLElement {
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
    this._scriptsToLoad = this.getAttribute("scripts")?.split(",") || [];
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
      })
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
    const interaction = this.getAttribute(
      `on:interaction`
    ) as ScriptInjectorProps["on:interaction"];
    for (const event of interaction!.split(",")) {
      this.addEventListener(event, this._loadScripts);
      this.registeredEvents.push({ type: event, listener: this._loadScripts });
    }
  }

  private _listenToDataLoaded(event: Event) {
    if (this.hasAttribute("data-loaded")) return;
    const { loadedScripts } = (event as OnDataLoadedEvent).detail;
    this._scriptsToLoad = this._scriptsToLoad.filter((script) => !loadedScripts.includes(script));
    if (this._scriptsToLoad.length === 0) {
      this.setAttribute("data-loaded", "");
      this._unregisterEvents();
    }
  }

  private _unregisterEvents() {
    document.dispatchEvent(
      new CustomEvent(ScriptInjectorEvents.DATA_LOADED, {
        detail: { loadedScripts: this._scriptsToLoad },
      })
    );
    this._intersectionObserver?.disconnect();
    this.registeredEvents.forEach(({ type, listener }) => {
      this.removeEventListener(type, listener);
    });
  }

  private _loadScripts() {
    try {
      this._scriptsToLoad.forEach((script) => this._loadScript(script));
    } catch (error) {
      console.error("Error loading scripts", error);
    } finally {
      this.setAttribute("data-loaded", "");
      this._unregisterEvents();
      this._notifyInjectors();
    }
  }

  private _loadScript(scriptToLoad: string) {
    const script = document.createElement("script");
    script.src = scriptToLoad;
    script.type = "module";
    document.head.appendChild(script);
  }

  private _setupIntersectionObserver() {
    const options: IntersectionObserverInit = {
      rootMargin: "50px   0px",
      threshold: 0.1,
    };

    this._intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this._loadScripts();
        }
      });
    }, options);

    this._intersectionObserver.observe(this);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "script-injector": ScriptInjector;
  }
  namespace JSX {
    interface IntrinsicElements {
      "script-injector": HtmlTag & ScriptInjectorProps;
    }
  }
  interface HTMLElementEventMap {
    [ScriptInjectorEvents.DATA_LOADED]: OnDataLoadedEvent;
  }
}
