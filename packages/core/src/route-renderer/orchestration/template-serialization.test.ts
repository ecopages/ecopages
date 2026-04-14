import { describe, expect, test } from 'vitest';
import {
	type DeferredTemplateSerializer,
	serializeTemplateShape,
	type SerializableTemplateShape,
} from './template-serialization.ts';

type TestTemplateShape = SerializableTemplateShape & {
	__testTemplateType: 'deferred-template';
};

function createTestTemplate(strings: readonly string[], values: readonly unknown[]): TestTemplateShape {
	return {
		__testTemplateType: 'deferred-template',
		strings,
		values,
	};
}

const testDeferredTemplateSerializer: DeferredTemplateSerializer<TestTemplateShape> = {
	matches(value: unknown): value is TestTemplateShape {
		return (
			typeof value === 'object' &&
			value !== null &&
			(value as { __testTemplateType?: unknown }).__testTemplateType === 'deferred-template' &&
			Array.isArray((value as { strings?: unknown }).strings) &&
			((value as { values?: unknown }).values === undefined ||
				Array.isArray((value as { values?: unknown }).values))
		);
	},
	serialize(template: TestTemplateShape, serializeValue: (value: unknown) => string | undefined) {
		return serializeTemplateShape(template, serializeValue);
	},
};

function serializeTestDeferredTemplateValue(
	value: unknown,
	serializeValue: (value: unknown) => string | undefined,
): string | undefined {
	if (!testDeferredTemplateSerializer.matches(value)) {
		return undefined;
	}

	return testDeferredTemplateSerializer.serialize(value, serializeValue);
}

describe('serializeTemplateLike', () => {
	test('preserves quoted attribute values for multi-token class attributes', () => {
		const html = serializeTemplateShape(
			createTestTemplate(['<div class=', '>', '</div>'], ['grid gap-4 lg:grid-cols-2 xl:grid-cols-4', 'Content']),
			(value) => (value == null ? '' : String(value)),
		);

		expect(html).toBe('<div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">Content</div>');
	});

	test('omits falsey boolean attributes and preserves truthy boolean attributes', () => {
		const truthyHtml = serializeTemplateShape(
			createTestTemplate(['<button ?disabled=', '>x</button>'], ['yes']),
			(value) => (value == null ? '' : String(value)),
		);
		const falseyHtml = serializeTemplateShape(
			createTestTemplate(['<button ?disabled=', '>x</button>'], ['']),
			(value) => (value == null ? '' : String(value)),
		);

		expect(truthyHtml).toBe('<button disabled>x</button>');
		expect(falseyHtml).toBe('<button>x</button>');
	});

	test('skips event and prop bindings in SSR output', () => {
		const html = serializeTemplateShape(
			createTestTemplate(['<button @click=', ' .value=', '>x</button>'], ['handler', '1']),
			(value) => (value == null ? '' : String(value)),
		);

		expect(html).toBe('<button>x</button>');
	});

	test('escapes attribute values while preserving child interpolation', () => {
		const html = serializeTemplateShape(
			createTestTemplate(['<div title=', '>', '</div>'], ['a "quote" & <tag>', '<span>child</span>']),
			(value) => (value == null ? '' : String(value)),
		);

		expect(html).toBe('<div title="a &quot;quote&quot; &amp; &lt;tag&gt;"><span>child</span></div>');
	});

	test('does not serialize unmatched template-like values', () => {
		expect(
			serializeTestDeferredTemplateValue(
				{
					strings: ['<div>', '</div>'],
					values: ['content'],
					_$litType$: 1,
				},
				(value) => (value == null ? '' : String(value)),
			),
		).toBeUndefined();
	});

	test('serializes locally provided template serializers without ambient registration', () => {
		expect(
			serializeTestDeferredTemplateValue(
				createTestTemplate(['<div class=', '>', '</div>'], ['shared gap-4', 'content']),
				(value) => (value == null ? '' : String(value)),
			),
		).toBe('<div class="shared gap-4">content</div>');
	});
});
