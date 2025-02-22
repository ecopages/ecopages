# Image Processor

# Proposed Feature: Data Attributes for Custom Width & Srcset

## Overview

We propose allowing users to set a data attribute on <img> tags to specify a custom width or entirely custom srcset. This approach can override default sizing logic for scenarios like:

- Fixed card images (always 300px wide or smaller).
- Small avatar images that never exceed a certain dimension.
- Advanced users needing to fully customize srcset breakpoints beyond the defaults.

## Possible Usage Example

<img src="/assets/image.jpg" data-fixed-size="small" alt="Avatar" />

If data-fixed-size is present, the processor should use the specified size instead of the default logic. This is useful for simple cases where a fixed size is sufficient.

For more advanced control:
<img src="/assets/large.jpg" data-custom-srcset="(max-width: small) small, (max-width: medium) medium" alt="Custom" />

When data-custom-srcset is present, the processor can skip default logic and insert the user-defined srcset.

## Updated Clarifications

Instead of “suffix,” we might use a more descriptive name like “label”. This makes it easier to refer to each size in data-custom-srcset. For example:

> sizes: [
>
> > { width: 320, label: 'small' },
> > { width: 768, label: 'medium' },
> > ]
> > Then you could write:
> > <img src="/assets/large.jpg" data-custom-srcset="(max-width: small) small, (max-width: medium) medium" alt="Custom" />

This clarifies which size label the processor uses without relying on arbitrary numeric values.

## Rationale

- “label” better conveys the idea of identifying a particular variant. Label will be added to the file name to create a unique identifier using a consistent naming convention via dash separator.
- “data-custom-srcset” references meaningful labels instead of numeric breaks.
- Reduces confusion when specifying manual breakpoints.

## Potential Benefits

- Avoid overfetching large images when a known smaller width is sufficient.
- Allow direct developer control for complex layout requirements.
- Keep the standard sizes for general usage, but enable per-image overrides.

## Implementation Steps

1. Enhance PictureGenerator or ImageProcessor to look for data-fixed-size or data-custom-srcset in <img> tags.
2. If data-fixed-size is found, generate or pick an image variant sized to that value.
3. If data-custom-srcset is found, bypass default calculations and insert the custom srcset directly.
4. Provide fallback logic if the specified attributes are invalid or unavailable.

## Default Behavior

If neither data-fixed-size nor data-custom-srcset is provided, the existing standard approach remains in place, so no explicit “fallback” logic is needed. The image processor will handle images using the normal sizes configuration as it does today.

_No actual code changes yet. This is just a design note. Feedback is welcome before applying._
