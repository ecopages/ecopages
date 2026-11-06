import { useContext } from 'react';
import { context } from './shared.js';
export function useCounter() {
	const value = useContext(context);
	if (!value) throw new Error('Missing counter provider');
	return value;
}
