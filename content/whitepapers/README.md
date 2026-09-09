# Whitepaper repository

No whitepapers exist in this repository yet. This is the structure new whitepapers should follow when they're produced — created now so there's a defined home for them, not to imply any currently exist.

## Structure

```
content/whitepapers/
  <whitepaper-slug>/
    source/         — editable source document (e.g. .docx, .md)
    pdf/             — final exported PDF
    images/          — charts, diagrams, figures used in the whitepaper
    metadata.json    — title, description, related service, related articles, publish status
```

## Naming

`<whitepaper-slug>` follows the same convention as article slugs: lowercase, hyphen-separated, descriptive (e.g. `the-ai-ready-organization`, matching the article it's paired with where one exists).

## Linking convention

A whitepaper should be referenced from:
1. The article(s) that introduce its subject (see the `whitepaper-cta` block already used on Thought Leadership article pages, currently rendering "Whitepaper in production — not yet available" — replace that status once a real PDF exists).
2. The relevant service page (`/customer-service-bots/`, `/it-services/`, or `/marketing-services/`).
3. `/resources/whitepapers-research/` once that section has real content (it is currently an honest, noindexed "being built" stub).

## Current status

Empty. Zero whitepapers exist. Do not add placeholder or fabricated whitepaper files here — only real documents.
