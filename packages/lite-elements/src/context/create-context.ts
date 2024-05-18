import type { Context } from './types';

/**
 * A function which creates a Context value object
 */
export const createContext = <ValueType>(key: unknown) => key as Context<typeof key, ValueType>;
