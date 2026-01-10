---
name: write-docs
description: Create or update documentation pages for the Abacus docs site. Use when adding new documentation, updating existing pages, or ensuring docs stay in sync with code changes. Ensures pages follow Starlight patterns and build correctly.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Write Docs Skill

Create and maintain documentation for the Abacus docs site (Astro Starlight).

## Before Starting

1. Read existing pages in `docs/src/content/docs/` to understand patterns
2. Check `docs/astro.config.mjs` for sidebar structure
3. Understand the section you're adding to (getting-started, providers, cli, deployment, development)

## Workflow

### Adding a New Page

1. Create `.mdx` file in the appropriate directory
2. Add required frontmatter (see below)
3. Use existing pages as reference for component usage
4. Run `cd docs && pnpm build` to verify

### Updating an Existing Page

1. Read the current page first
2. Make changes, preserving existing patterns
3. Run `cd docs && pnpm build` to verify

## Frontmatter

Every page requires:

```mdx
---
title: Page Title
description: One-line description for SEO
sidebar:
  order: 1  # Position within section
---
```

## Key Rules

### Links Must Include Base Path

Internal links need `/abacus/` prefix (GitHub Pages requirement):

```mdx
[Quick Start](/abacus/getting-started/quick-start/)  ✓
[Quick Start](/getting-started/quick-start/)          ✗
```

### Import Components Before Use

```mdx
import { Steps, Aside } from '@astrojs/starlight/components';

<Steps>
1. First step
2. Second step
</Steps>

<Aside type="tip">Helpful note</Aside>
```

### Code Blocks Need Language Tags

```mdx
```bash
pnpm cli sync
```
```

## Build Verification

**Always verify before committing:**

```bash
cd docs && pnpm build
```

Common errors:
- Missing imports
- Invalid frontmatter
- Broken links (wrong path or missing `/abacus/`)

## Style Guidelines

- Imperative mood ("Run this" not "You should run")
- Code examples over abstract descriptions
- Keep paragraphs short - users skim
- Tables for reference data (env vars, options)
