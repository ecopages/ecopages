import { BaseLayout } from '../layouts/base-layout/base-layout.kita';

export const config = {
layout: BaseLayout,
dependencies: {
stylesheets: ['./docs.css'],
},
};

<div class="docs-page__prose">

# MDX Route

This page stays on the standalone Kita MDX pipeline so the kitchen sink exercises both markdown stacks side by side.

- `.md` files are rendered by the standalone MDX integration with `@kitajs/html`.
- `.mdx` files are rendered by the React integration and can participate in React Router navigation.
- The HTML shell and route layout are still shared with the rest of the kitchen sink.
- Request middleware continues to populate `locals` for dynamic pages and handlers.

```ts
export const config = {
	layout: BaseLayout,
};
```

Try these routes next:

- [React MDX route](/react-content)
- [React page route](/react-lab)
- [Middleware locals](/patterns/middleware?flag=mdx&flag=runtime)
- [Catalog dynamic route](/catalog/semantic-html)
- [API lab](/api-lab)

Return to the [home page](/).

</div>
