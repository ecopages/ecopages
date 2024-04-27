export type AttributeTypeConstant = typeof Array | typeof Boolean | typeof Number | typeof Object | typeof String;

export type AttributeTypeDefault = Array<unknown> | boolean | number | Record<string, unknown> | string;

export type RenderInsertPosition = 'replace' | 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
