import { type LitElement, unsafeCSS } from 'lit';

type Constructor<T> = new (...args: any[]) => T;

export const StyledMixin = <T extends Constructor<LitElement>>(superClass: T, css: string[] = []) => {
  console.log(css);
  // biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
  class StyledMixinClass extends superClass {
    static styles = [
      (superClass as unknown as typeof LitElement).styles ?? [],
      ...css.map((styles) => unsafeCSS(styles)),
    ];
  }
  return StyledMixinClass as Constructor<LitElement> & T;
};
