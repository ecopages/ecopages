export class LocalsAccessError extends Error {
	override name = 'LocalsAccessError';

	constructor(message: string) {
		super(message);
	}
}
