---
'@ecopages/core': patch
'@ecopages/react': patch
'@ecopages/react-router': patch
---

Give each component, layout and page declared in one file its own identity. Before, every `eco.*` declaration in a file shared one `config.identity.id`, so a second React island from that file hydrated as the first, an SPA navigation between two layouts exported from one file kept the first layout, and a layout stack built from one file rendered its outer layout twice.

`config.identity.id` is now distinct for each declaration and stays the same while unrelated code in the file changes; `config.identity.file` is still the module path shared by every declaration in the file. Integrations that tell components apart by `identity.file` should use `identity.id` instead, and keep `file` for per-module work such as bundling and watching.
