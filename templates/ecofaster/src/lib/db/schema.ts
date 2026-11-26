import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const collections = sqliteTable('collections', {
	id: integer('id').primaryKey(),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	tagline: text('tagline').notNull(),
	position: integer('position').notNull(),
});

export const categories = sqliteTable(
	'categories',
	{
		id: integer('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		position: integer('position').notNull(),
		collectionId: integer('collection_id')
			.notNull()
			.references(() => collections.id),
	},
	(table) => [index('categories_collection_idx').on(table.collectionId)],
);

export const subcategories = sqliteTable(
	'subcategories',
	{
		id: integer('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		position: integer('position').notNull(),
		categoryId: integer('category_id')
			.notNull()
			.references(() => categories.id),
	},
	(table) => [index('subcategories_category_idx').on(table.categoryId)],
);

export const products = sqliteTable(
	'products',
	{
		id: integer('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		description: text('description').notNull(),
		priceCents: integer('price_cents').notNull(),
		/** The price before a sale; set only for products on sale. */
		compareAtCents: integer('compare_at_cents'),
		material: text('material').notNull(),
		/** The finishes a visitor can pick, comma-separated; the first is the default. */
		finishes: text('finishes').notNull(),
		badge: text('badge', { enum: ['new', 'sale'] }),
		position: integer('position').notNull(),
		subcategoryId: integer('subcategory_id')
			.notNull()
			.references(() => subcategories.id),
	},
	(table) => [index('products_subcategory_idx').on(table.subcategoryId, table.position)],
);

/** Key-value facts about the seeded catalog, such as the size preset it was generated with. */
export const catalogMeta = sqliteTable('catalog_meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
});

export type CollectionRow = typeof collections.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type SubcategoryRow = typeof subcategories.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
