---
name: write-tip
description: Create or improve AI productivity tips and guides for the Abacus dashboard. Use when writing new tips, editing existing tips, or reviewing tip content for quality. Ensures tips follow the established format with scenarios, prompts, and proper structure.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Write Tip Skill

Create high-quality AI productivity tips and guides for the Abacus dashboard.

## Before Writing

Read these files to understand the existing format:
- `src/lib/tips.ts` - All existing tips and guides (study the structure)
- `CLAUDE.md` - Project guidelines including tip writing rules

## Tip Structure

Each tip has two parts:

### 1. TipBar Entry (in TIPS array)

```typescript
{
  id: 'unique-kebab-id',
  text: 'Concise tip shown in the banner (one sentence)',
  guide: 'guide-slug',  // Links to the guide below
}
```

### 2. Guide Entry (in GUIDES object)

```typescript
'guide-slug': {
  slug: 'guide-slug',
  title: 'Short Title',
  description: 'One-line description',
  externalDocs: 'https://...',  // Optional official docs link
  tools: ['claude-code', 'cursor'],  // Which tools it applies to
  content: `
## What is [Feature]?

One to two sentences explaining what this is. No fluff.

## Try It: [Scenario Name]

**Scenario**: Brief context (one sentence).

**Step 1**: Do this
\`\`\`
Exact prompt text the user types
\`\`\`

**Step 2**: Then this
\`\`\`
Another prompt
\`\`\`

## Key Points

- **Point one** - brief explanation
- **Point two** - brief explanation
- **Point three** - brief explanation
  `,
}
```

## Writing Rules

1. **Prompts are primary** - Show exact text users type, not abstract descriptions
2. **Scenarios > theory** - "Here's how to do X" beats "X is useful because..."
3. **Concise** - Users skim; keep sections short
4. **No fluff** - Skip "In this guide you'll learn..." intros
5. **No `>` prefix** - Don't prefix prompt examples with `>` (causes rendering issues)
6. **Separate code blocks** - Don't mix bash commands with prompts in the same block

## Code Block Formatting

Use plain code blocks for prompts (no language specifier):
```
This is a prompt the user types
```

Use `bash` for shell commands:
```bash
git checkout -b feature/new-thing
```

Use `markdown` for file content examples:
```markdown
---
name: my-skill
---
```

## Tools Field

- `'claude-code'` - Claude Code CLI features
- `'cursor'` - Cursor editor features
- Use both if the tip applies to both tools

## Quality Checklist

Before finishing, verify:

- [ ] Has a concrete "Try It" scenario with copy-pasteable prompts
- [ ] No `>` prefix on prompt lines
- [ ] Code blocks have correct language tags (or none for prompts)
- [ ] Description is one line, not a paragraph
- [ ] Tools array is accurate
- [ ] Slug matches the guide key
- [ ] At least 2-3 related TipBar entries point to this guide

## Adding Icons

If creating a new guide, add its icon mapping in:
- `src/app/tips/page.tsx` - GUIDE_ICONS object
- `src/app/tips/[slug]/page.tsx` - GUIDE_ICONS object

Available icons from lucide-react: Compass, RefreshCw, Command, MapPin, Cpu, MessageSquare, GitBranch, Users, FileCode, Zap, Star, etc.
