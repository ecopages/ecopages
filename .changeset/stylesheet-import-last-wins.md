---
'@ecopages/core': patch
---

Keep the last instance of a stylesheet that is imported more than once when core inlines `@import`s, for app and package stylesheets. The cascade orders equal-specificity rules by their last occurrence, and Lightning CSS already did; core kept the first, so the same source ordered differently with and without a Processor.
