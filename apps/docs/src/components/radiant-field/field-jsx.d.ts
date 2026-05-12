// import type {
// 	AriaAttributesNormalized,
// 	ClassList,
// 	DataAttributeValue,
// 	JsxEventListener,
// 	JsxKey,
// 	JsxRenderable,
// 	StyleValue,
// } from '@ecopages/jsx';
// import type { RadiantSelectProps } from '../radiant-select/select.script';
// import type { RadiantSliderProps } from '../radiant-slider/slider.script';
// import type { RadiantToggleGroupProps } from '../radiant-toggle-group/toggle-group.script';

// type StructuredAttributePrimitive = string | number | boolean | null | undefined;

// export type DocsJsxCustomElementAttributes<ElementType extends EventTarget = HTMLElement, Props extends object = {}> =
// 	Partial<Props> & {
// 		key?: JsxKey;
// 		children?: JsxRenderable;
// 		class?: string;
// 		classes?: ClassList;
// 		style?: StyleValue;
// 		aria?: Partial<AriaAttributesNormalized>;
// 		data?: Record<string, DataAttributeValue>;
// 	} & {
// 		[EventName in keyof GlobalEventHandlersEventMap as `on:${EventName}`]?: JsxEventListener<
// 			GlobalEventHandlersEventMap[EventName],
// 			ElementType
// 		>;
// 	} & {
// 		[EventName in keyof GlobalEventHandlersEventMap as `on-native:${EventName}`]?: JsxEventListener<
// 			GlobalEventHandlersEventMap[EventName],
// 			ElementType
// 		>;
// 	} & {
// 		[eventName: `on:${string}`]: JsxEventListener<Event, ElementType> | undefined;
// 		[eventName: `on-native:${string}`]: JsxEventListener<Event, ElementType> | undefined;
// 		[propertyName: `prop:${string}`]: unknown;
// 		[attributeName: `attr:${string}`]: StructuredAttributePrimitive;
// 	};

// export interface DocsRadiantJsxIntrinsicElements {
// 	'radiant-select': DocsJsxCustomElementAttributes<HTMLElement, RadiantSelectProps>;
// 	'radiant-slider': DocsJsxCustomElementAttributes<HTMLElement, RadiantSliderProps>;
// 	'radiant-toggle-group': DocsJsxCustomElementAttributes<HTMLElement, RadiantToggleGroupProps>;
// }

// declare module '@ecopages/jsx' {
// 	interface JsxCustomIntrinsicElements extends DocsRadiantJsxIntrinsicElements {}
// }
