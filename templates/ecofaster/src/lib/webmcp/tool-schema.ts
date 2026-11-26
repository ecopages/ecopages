type PropertyBase = { description: string };

export type StringProperty = PropertyBase & { type: 'string'; minLength?: number; maxLength?: number };
export type IntegerProperty = PropertyBase & { type: 'integer'; minimum: number; maximum: number };
export type BooleanProperty = PropertyBase & { type: 'boolean' };
export type ToolProperty = StringProperty | IntegerProperty | BooleanProperty;

/**
 * The JSON Schema subset the ecofaster tools use: a flat object of strings, bounded integers and booleans.
 *
 * @remarks
 * The same object is the tool's `inputSchema` and the rules {@link validateToolInput} checks, so what the agent
 * is told and what the tool accepts cannot drift apart. The WebMCP draft only serializes `inputSchema`; it does
 * not validate the input against it, so each tool validates before it acts.
 */
export type ToolInputSchema = {
	type: 'object';
	properties: Record<string, ToolProperty>;
	required: string[];
	additionalProperties: false;
};

export type ToolInputResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

function checkProperty(name: string, property: ToolProperty, value: unknown): string | null {
	if (property.type === 'string') {
		if (typeof value !== 'string') return `${name}: expected a string`;
		if (property.minLength !== undefined && value.trim().length < property.minLength) {
			return `${name}: expected at least ${property.minLength} characters`;
		}
		if (property.maxLength !== undefined && value.length > property.maxLength) {
			return `${name}: expected at most ${property.maxLength} characters`;
		}
		return null;
	}
	if (property.type === 'integer') {
		const inRange =
			typeof value === 'number' &&
			Number.isInteger(value) &&
			value >= property.minimum &&
			value <= property.maximum;
		return inRange ? null : `${name}: expected an integer from ${property.minimum} to ${property.maximum}`;
	}
	return typeof value === 'boolean' ? null : `${name}: expected true or false`;
}

function readObject(input: unknown): Record<string, unknown> | null {
	let value = input;
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/**
 * Checks a tool call's input against its schema; the error names the first field that fails.
 *
 * @remarks
 * Accepts the input as an object or a JSON string, since agents differ in which they send.
 */
export function validateToolInput(schema: ToolInputSchema, input: unknown): ToolInputResult {
	const object = readObject(input);
	if (!object) return { ok: false, error: 'input: expected an object' };

	for (const name of Object.keys(object)) {
		if (!Object.hasOwn(schema.properties, name)) return { ok: false, error: `${name}: not a field of this tool` };
	}
	for (const name of schema.required) {
		if (object[name] === undefined) return { ok: false, error: `${name}: required` };
	}
	for (const [name, property] of Object.entries(schema.properties)) {
		if (object[name] === undefined) continue;
		const error = checkProperty(name, property, object[name]);
		if (error) return { ok: false, error };
	}
	return { ok: true, value: object };
}
