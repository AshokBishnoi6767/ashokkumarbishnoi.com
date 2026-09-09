# Image repository

No image files (PNG/JPG/WEBP/GIF/SVG-as-asset) exist anywhere in this repository as of this pass. All current on-site visuals are generated at runtime as inline SVG by `/assets/js/article-visuals.js` — there was nothing to reorganize or rename. This README defines the structure and naming convention for when real images/photography/illustrations are produced, so they land in a consistent system from day one instead of needing a rename pass later.

## Naming convention

`<image-description>-<keyword>-<sitemap-position>.webp`

Lowercase, hyphen-separated, descriptive, stable, human-readable. No keyword stuffing, no `image1.png` / `final.png` / `hero-new.png` style names.

Examples (illustrative — none of these files exist yet):

- `customer-service-ai-bot-waterloo-homepage.webp`
- `customer-service-automation-b2b-saas-customer-service-bots.webp`
- `it-services-b2b-saas-waterloo-it-services.webp`
- `marketing-services-b2b-saas-toronto-marketing-services.webp`
- `industry-4-0-transformation-map-homepage.webp`

## Suggested folder structure

```
public/assets/images/
  homepage/
  customer-service-bots/
  it-services/
  marketing-services/
  about/
  resources/
    thought-leadership/
    b2b-saas-geography/
  shared/         — logo, favicon, OG default, anything reused across pages
```

## Alt text rule

Alt text describes what the image actually shows, tied to the page's real content — never a keyword-stuffed phrase. Purely decorative images (if any are ever added) get `alt=""` and are not narrated to assistive tech, consistent with how `article-visuals.js` already treats its unlabeled decorative icons (`aria-hidden="true"`) versus its labeled explanatory ones (`role="img"` + `aria-label`).

## Current status

Empty. Do not add placeholder or stock images here to "fill" the structure — only real, produced assets.
