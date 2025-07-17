/**
 * This module contains StyledMixin
 * It is used to add styles to a LitElement
 * @module
 */
import { type LitElement, unsafeCSS } from 'lit';

type Constructor<T> = new (...args: any[]) => T;

/**
 * A mixin to add styles to a LitElement
 * @param superClass - The class to mix into
 * @param css - The styles to add
 * @returns The class with the styles added
 */
export const StyledMixin = <T extends Constructor<LitElement>>(
	superClass: T,
	css: string[] = [],
): Constructor<LitElement> & T => {
	class StyledMixinClass extends superClass {
		static styles = [
			(superClass as unknown as typeof LitElement).styles ?? [],
			...css.map((styles) => unsafeCSS(styles)),
		];
	}
	return StyledMixinClass as Constructor<LitElement> & T;
};
