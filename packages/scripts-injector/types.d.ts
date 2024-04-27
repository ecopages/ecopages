import type { ScriptsInjector } from './scripts-injector';
import { ScriptInjectorEvents, type conditions } from './scripts-injector';

export type OnDataLoadedEvent = CustomEvent<{ loadedScripts: string[] }>;

export type Conditions = (typeof conditions)[number];

declare global {
  interface HTMLElementTagNameMap {
    'scripts-injector': ScriptsInjector;
  }
  namespace JSX {
    interface IntrinsicElements {
      'scripts-injector': HtmlTag & ScriptInjectorProps;
    }
  }
  interface HTMLElementEventMap {
    [ScriptInjectorEvents.DATA_LOADED]: OnDataLoadedEvent;
  }
}

export declare type ScriptInjectorProps = {
  /**
   * @description Load the script once the dom is ready
   * @example <script-injector on:idle></script-injector>
   */
  'on:idle'?: boolean;
  /**
   * @description Load the script based on a series of events
   * @example <script-injector on:interaction="mouseenter, focusin"></script-injector>
   */
  'on:interaction'?: 'touchstart,click' | 'mouseenter,focusin';
  /**
   * @description Import a script to be loaded when the observer detects the element is in the viewport
   * @example <script-injector on:visible="50px 1px"></script-injector>
   */
  'on:visible'?: string | boolean;
  /**
   * A list of scripts to be loaded, comma separated.
   */
  scripts: string;
};
