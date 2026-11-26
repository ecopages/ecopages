/** A leaf of the taxonomy: `name` titles its page, `item` names one product in it. */
export type SubcategorySeed = {
	name: string;
	item: string;
	basePrice: number;
};

export type CategorySeed = {
	name: string;
	subcategories: SubcategorySeed[];
};

export type CollectionSeed = {
	name: string;
	tagline: string;
	categories: CategorySeed[];
};

/**
 * The shape of the generated catalog, from which every size preset takes a prefix.
 *
 * @remarks
 * Order matters: the small preset takes the first entries of each list, so the first collection, category and
 * subcategory are the ones a fresh checkout shows. Base prices are in cents.
 */
export const TAXONOMY: CollectionSeed[] = [
	{
		name: 'Living',
		tagline: 'Seating, tables and light for the room you spend most time in.',
		categories: [
			{
				name: 'Seating',
				subcategories: [
					{ name: 'Lounge chairs', item: 'lounge chair', basePrice: 42000 },
					{ name: 'Sofas', item: 'sofa', basePrice: 129000 },
					{ name: 'Benches', item: 'bench', basePrice: 26000 },
					{ name: 'Stools', item: 'stool', basePrice: 9000 },
				],
			},
			{
				name: 'Tables',
				subcategories: [
					{ name: 'Coffee tables', item: 'coffee table', basePrice: 32000 },
					{ name: 'Side tables', item: 'side table', basePrice: 14000 },
					{ name: 'Console tables', item: 'console table', basePrice: 38000 },
					{ name: 'Nesting tables', item: 'nesting table set', basePrice: 24000 },
				],
			},
			{
				name: 'Lighting',
				subcategories: [
					{ name: 'Floor lamps', item: 'floor lamp', basePrice: 18000 },
					{ name: 'Table lamps', item: 'table lamp', basePrice: 9500 },
					{ name: 'Pendant lights', item: 'pendant light', basePrice: 15000 },
					{ name: 'Wall sconces', item: 'wall sconce', basePrice: 11000 },
				],
			},
			{
				name: 'Textiles',
				subcategories: [
					{ name: 'Throws', item: 'throw', basePrice: 7500 },
					{ name: 'Cushions', item: 'cushion', basePrice: 4500 },
					{ name: 'Rugs', item: 'rug', basePrice: 29000 },
					{ name: 'Curtains', item: 'curtain pair', basePrice: 12000 },
				],
			},
		],
	},
	{
		name: 'Workspace',
		tagline: 'Desks, chairs and storage for focused work at home.',
		categories: [
			{
				name: 'Desks',
				subcategories: [
					{ name: 'Standing desks', item: 'standing desk', basePrice: 62000 },
					{ name: 'Writing desks', item: 'writing desk', basePrice: 34000 },
					{ name: 'Corner desks', item: 'corner desk', basePrice: 48000 },
					{ name: 'Desk shelves', item: 'desk shelf', basePrice: 8500 },
				],
			},
			{
				name: 'Office seating',
				subcategories: [
					{ name: 'Desk chairs', item: 'desk chair', basePrice: 39000 },
					{ name: 'Task stools', item: 'task stool', basePrice: 21000 },
					{ name: 'Kneeling chairs', item: 'kneeling chair', basePrice: 24000 },
					{ name: 'Footrests', item: 'footrest', basePrice: 6000 },
				],
			},
			{
				name: 'Storage',
				subcategories: [
					{ name: 'Filing cabinets', item: 'filing cabinet', basePrice: 27000 },
					{ name: 'Bookcases', item: 'bookcase', basePrice: 31000 },
					{ name: 'Drawer units', item: 'drawer unit', basePrice: 19000 },
					{ name: 'Wall shelves', item: 'wall shelf', basePrice: 7000 },
				],
			},
			{
				name: 'Desk accessories',
				subcategories: [
					{ name: 'Desk lamps', item: 'desk lamp', basePrice: 8000 },
					{ name: 'Monitor stands', item: 'monitor stand', basePrice: 6500 },
					{ name: 'Pen holders', item: 'pen holder', basePrice: 2500 },
					{ name: 'Cable trays', item: 'cable tray', basePrice: 3500 },
				],
			},
		],
	},
	{
		name: 'Kitchen',
		tagline: 'Cookware, tableware and the chairs around the table.',
		categories: [
			{
				name: 'Dining',
				subcategories: [
					{ name: 'Dining chairs', item: 'dining chair', basePrice: 16000 },
					{ name: 'Dining tables', item: 'dining table', basePrice: 74000 },
					{ name: 'Bar stools', item: 'bar stool', basePrice: 13000 },
					{ name: 'Sideboards', item: 'sideboard', basePrice: 82000 },
				],
			},
			{
				name: 'Cookware',
				subcategories: [
					{ name: 'Frying pans', item: 'frying pan', basePrice: 6500 },
					{ name: 'Saucepans', item: 'saucepan', basePrice: 7000 },
					{ name: 'Dutch ovens', item: 'dutch oven', basePrice: 18000 },
					{ name: 'Woks', item: 'wok', basePrice: 7500 },
				],
			},
			{
				name: 'Tableware',
				subcategories: [
					{ name: 'Plates', item: 'plate set', basePrice: 5500 },
					{ name: 'Bowls', item: 'bowl set', basePrice: 4800 },
					{ name: 'Mugs', item: 'mug', basePrice: 1800 },
					{ name: 'Glasses', item: 'glass set', basePrice: 3800 },
				],
			},
			{
				name: 'Utensils',
				subcategories: [
					{ name: 'Knives', item: 'knife', basePrice: 9000 },
					{ name: 'Cutting boards', item: 'cutting board', basePrice: 4500 },
					{ name: 'Spatulas', item: 'spatula', basePrice: 1500 },
					{ name: 'Whisks', item: 'whisk', basePrice: 1400 },
				],
			},
		],
	},
	{
		name: 'Outdoors',
		tagline: 'Furniture, planters and tools for balconies and gardens.',
		categories: [
			{
				name: 'Garden furniture',
				subcategories: [
					{ name: 'Garden chairs', item: 'garden chair', basePrice: 12000 },
					{ name: 'Loungers', item: 'lounger', basePrice: 28000 },
					{ name: 'Picnic tables', item: 'picnic table', basePrice: 36000 },
					{ name: 'Hammocks', item: 'hammock', basePrice: 9500 },
				],
			},
			{
				name: 'Planters',
				subcategories: [
					{ name: 'Pots', item: 'pot', basePrice: 3500 },
					{ name: 'Window boxes', item: 'window box', basePrice: 4200 },
					{ name: 'Raised beds', item: 'raised bed', basePrice: 16000 },
					{ name: 'Hanging planters', item: 'hanging planter', basePrice: 3000 },
				],
			},
			{
				name: 'Outdoor lighting',
				subcategories: [
					{ name: 'Lanterns', item: 'lantern', basePrice: 5500 },
					{ name: 'String lights', item: 'string light', basePrice: 4000 },
					{ name: 'Path lights', item: 'path light', basePrice: 3200 },
					{ name: 'Solar lamps', item: 'solar lamp', basePrice: 4800 },
				],
			},
			{
				name: 'Garden tools',
				subcategories: [
					{ name: 'Trowels', item: 'trowel', basePrice: 1600 },
					{ name: 'Pruners', item: 'pruner', basePrice: 3400 },
					{ name: 'Watering cans', item: 'watering can', basePrice: 3000 },
					{ name: 'Rakes', item: 'rake', basePrice: 2800 },
				],
			},
		],
	},
	{
		name: 'Bedroom',
		tagline: 'Beds, bedding and storage for slower mornings.',
		categories: [
			{
				name: 'Beds',
				subcategories: [
					{ name: 'Bed frames', item: 'bed frame', basePrice: 68000 },
					{ name: 'Headboards', item: 'headboard', basePrice: 22000 },
					{ name: 'Daybeds', item: 'daybed', basePrice: 54000 },
					{ name: 'Bunk beds', item: 'bunk bed', basePrice: 61000 },
				],
			},
			{
				name: 'Bedding',
				subcategories: [
					{ name: 'Duvets', item: 'duvet', basePrice: 15000 },
					{ name: 'Pillows', item: 'pillow', basePrice: 4500 },
					{ name: 'Sheets', item: 'sheet set', basePrice: 9000 },
					{ name: 'Blankets', item: 'blanket', basePrice: 8500 },
				],
			},
			{
				name: 'Wardrobes',
				subcategories: [
					{ name: 'Wardrobes', item: 'wardrobe', basePrice: 88000 },
					{ name: 'Dressers', item: 'dresser', basePrice: 52000 },
					{ name: 'Clothes rails', item: 'clothes rail', basePrice: 9000 },
					{ name: 'Shoe racks', item: 'shoe rack', basePrice: 7000 },
				],
			},
			{
				name: 'Bedside',
				subcategories: [
					{ name: 'Nightstands', item: 'nightstand', basePrice: 17000 },
					{ name: 'Reading lamps', item: 'reading lamp', basePrice: 8500 },
					{ name: 'Alarm clocks', item: 'alarm clock', basePrice: 3500 },
					{ name: 'Vanity chairs', item: 'vanity chair', basePrice: 14000 },
				],
			},
		],
	},
	{
		name: 'Bath',
		tagline: 'Towels, storage and small comforts for the bathroom.',
		categories: [
			{
				name: 'Towels',
				subcategories: [
					{ name: 'Bath towels', item: 'bath towel', basePrice: 3200 },
					{ name: 'Hand towels', item: 'hand towel', basePrice: 1600 },
					{ name: 'Bath mats', item: 'bath mat', basePrice: 2800 },
					{ name: 'Robes', item: 'robe', basePrice: 7500 },
				],
			},
			{
				name: 'Bath storage',
				subcategories: [
					{ name: 'Vanity units', item: 'vanity unit', basePrice: 46000 },
					{ name: 'Bath shelves', item: 'bath shelf', basePrice: 6000 },
					{ name: 'Laundry baskets', item: 'laundry basket', basePrice: 4500 },
					{ name: 'Towel ladders', item: 'towel ladder', basePrice: 7000 },
				],
			},
			{
				name: 'Mirrors',
				subcategories: [
					{ name: 'Wall mirrors', item: 'wall mirror', basePrice: 15000 },
					{ name: 'Vanity mirrors', item: 'vanity mirror', basePrice: 6500 },
					{ name: 'Floor mirrors', item: 'floor mirror', basePrice: 24000 },
					{ name: 'Cabinet mirrors', item: 'cabinet mirror', basePrice: 19000 },
				],
			},
			{
				name: 'Bath accessories',
				subcategories: [
					{ name: 'Soap dishes', item: 'soap dish', basePrice: 1500 },
					{ name: 'Toothbrush holders', item: 'toothbrush holder', basePrice: 1400 },
					{ name: 'Shower caddies', item: 'shower caddy', basePrice: 3600 },
					{ name: 'Bath stools', item: 'bath stool', basePrice: 5200 },
				],
			},
		],
	},
];

/** Invented model names; a product name is a model, an optional material, and its subcategory's `item`. */
export const MODEL_NAMES = [
	'Alder',
	'Amble',
	'Arden',
	'Basil',
	'Birch',
	'Bramble',
	'Calla',
	'Cedar',
	'Cove',
	'Dale',
	'Dune',
	'Ember',
	'Fern',
	'Field',
	'Fjord',
	'Glen',
	'Harbor',
	'Hazel',
	'Heath',
	'Iris',
	'Juniper',
	'Kestrel',
	'Larch',
	'Linden',
	'Loam',
	'Maple',
	'Marlo',
	'Meadow',
	'Moss',
	'Nook',
	'Oriel',
	'Pebble',
	'Pine',
	'Quill',
	'Reed',
	'Ridge',
	'Rowan',
	'Sable',
	'Sage',
	'Shore',
	'Sorrel',
	'Sparrow',
	'Tarn',
	'Thistle',
	'Tide',
	'Umber',
	'Vale',
	'Willow',
	'Wren',
	'Yarrow',
];

export const MATERIALS = [
	'oak',
	'walnut',
	'ash',
	'beech',
	'linen',
	'wool',
	'cotton',
	'cane',
	'rattan',
	'steel',
	'brass',
	'ceramic',
	'stoneware',
	'glass',
	'cork',
	'bamboo',
	'leather',
	'terracotta',
	'marble',
	'enamel',
];

export const FINISHES = ['natural', 'charcoal', 'sand', 'moss green', 'clay', 'ivory', 'slate blue', 'rust'];
