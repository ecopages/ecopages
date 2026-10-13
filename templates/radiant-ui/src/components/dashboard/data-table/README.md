# Dashboard inventory table

Working data table for `/dashboard`, ported from the Radiant UI
`data-table` story.

The host (`<dashboard-data-table>`) owns search, filters, sort, pagination,
and add/edit/delete. There is no HTTP API: `data.ts` keeps a session-scoped
inventory in memory so the table can paginate and mutate like the Storybook
example.

List `DataTable` in the page `dependencies.components`. Nested `rui-table`,
`rui-pagination`, and dialog hosts are stamped by this element, so their
stylesheets are declared here rather than as sibling components.
