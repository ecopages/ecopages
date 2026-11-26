/**
 * Limits the adapter enforces, the forms offer and the agent tools declare, kept in one browser-safe module so the
 * three cannot drift apart.
 */
export const LIMITS = {
	/** Distinct variants a cart holds. */
	cartLines: 50,
	/** Units of one variant in a cart. */
	quantity: 99,
	/** Seconds a cart lives after its last change, in the database and in the cookie: thirty days. */
	cartLifetimeSeconds: 30 * 24 * 60 * 60,
	/** Shortest search term looked up; one letter matches most of the catalog. */
	minSearchTerm: 2,
	/** Longest search term kept, so a pasted essay does not become a database scan pattern. */
	maxSearchTerm: 80,
	/** Most products a short JSON list (`?pageSize=`) returns. */
	maxListSize: 24,
} as const;
