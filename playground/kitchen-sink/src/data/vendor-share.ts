import { z } from 'zod';

const vendorShareSchema = z.object({
	label: z.string(),
	value: z.number(),
});

export type VendorSharePayload = z.infer<typeof vendorShareSchema>;

/**
 * Parses fixture payloads for the shared-vendor kitchen-sink pages.
 */
export function parseVendorSharePayload(input: unknown): VendorSharePayload {
	return vendorShareSchema.parse(input);
}
