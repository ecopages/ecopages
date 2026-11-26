type PropertyBase = { description: string };

export type StringProperty = PropertyBase & {
	type: 'string';
	minLength?: number;
	maxLength?: number;
	enum?: readonly string[];
};
export type IntegerProperty = PropertyBase & { type: 'integer'; minimum: number; maximum: number };
export type BooleanProperty = PropertyBase & { type: 'boolean' };
export type StringListProperty = PropertyBase & { type: 'array'; items: { type: 'string' }; maxItems: number };
export type ToolProperty = StringProperty | IntegerProperty | BooleanProperty | StringListProperty;

/**
 * The JSON Schema subset the storefront tools use: a flat object of strings, bounded integers, booleans and
 * lists of strings.
 *
 * @remarks
 * The same object is the tool's `inputSchema` and the rules {@link validateToolInput} checks, so what the agent
 * is told and what the tool accepts cannot drift apart. The WebMCP draft only serializes `inputSchema`; it does
 * not validate the input against it, so each tool validates before it acts.
 */
export type ToolInputSchema = {
	type: 'object';
	properties: Readonly<Record<string, ToolProperty>>;
	required: readonly string[];
	additionalProperties: false;
};

type PropertyValue<P extends ToolProperty> = P extends { type: 'string'; enum: readonly (infer Choice)[] }
	? Choice
	: P extends { type: 'string' }
		? string
		: P extends { type: 'integer' }
			? number
			: P extends { type: 'boolean' }
				? boolean
				: string[];

type RequiredName<S extends ToolInputSchema> = S['required'][number] & keyof S['properties'];

/** The values a schema accepts: its required fields, and its other fields as optional ones. */
export type ToolInput<S extends ToolInputSchema> = {
	[Name in RequiredName<S>]: PropertyValue<S['properties'][Name]>;
} & {
	[Name in Exclude<keyof S['properties'], RequiredName<S>>]?: PropertyValue<S['properties'][Name]>;
};

export type ToolInputResult<S extends ToolInputSchema> =
	{ ok: true; value: ToolInput<S> } | { ok: false; error: string };

function checkString(name: string, property: StringProperty, value: unknown): string | null {
	if (typeof value !== 'string') return `${name}: expected a string`;
	if (property.minLength !== undefined && value.trim().length < property.minLength) {
		return `${name}: expected at least ${property.minLength} characters`;
	}
	if (property.maxLength !== undefined && value.length > property.maxLength) {
		return `${name}: expected at most ${property.maxLength} characters`;
	}
	if (property.enum && !property.enum.includes(value)) return `${name}: expected one of ${property.enum.join(', ')}`;
	return null;
}

function checkStringList(name: string, property: StringListProperty, value: unknown): string | null {
	if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
		return `${name}: expected a list of strings`;
	}
	return value.length > property.maxItems ? `${name}: expected at most ${property.maxItems} strings` : null;
}

function checkInteger(name: string, property: IntegerProperty, value: unknown): string | null {
	const inRange =
		typeof value === 'number' && Number.isInteger(value) && value >= property.minimum && value <= property.maximum;
	return inRange ? null : `${name}: expected an integer from ${property.minimum} to ${property.maximum}`;
}

function checkProperty(name: string, property: ToolProperty, value: unknown): string | null {
	switch (property.type) {
		case 'string':
			return checkString(name, property, value);
		case 'array':
			return checkStringList(name, property, value);
		case 'integer':
			return checkInteger(name, property, value);
		case 'boolean':
			return typeof value === 'boolean' ? null : `${name}: expected true or false`;
	}
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
 * Accepts the input as an object or a JSON string, since agents differ in which they send. The checks above are
 * what make the final cast to {@link ToolInput} true.
 */
export function validateToolInput<S extends ToolInputSchema>(schema: S, input: unknown): ToolInputResult<S> {
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
	return { ok: true, value: object as ToolInput<S> };
}
