// Tips and guides for AI tool productivity
// Each tip can optionally link to an internal guide or external documentation

export interface Tip {
  id: string;
  text: string;
  guide?: string;        // Internal guide slug (renders at /tips/[slug])
  externalUrl?: string;  // External documentation URL
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  content: string;       // Markdown content
  externalDocs?: string; // Link to official docs
  tools: ('claude-code' | 'cursor')[];  // Which tools this guide applies to
}

// Tips shown in the TipBar - rotate randomly on each load
export const TIPS: Tip[] = [
  // Subagents
  {
    id: 'subagents-intro',
    text: 'Use subagents to parallelize tasks - they run in isolated contexts without polluting your main conversation',
    guide: 'subagents',
  },
  {
    id: 'subagents-explore',
    text: 'Use explore/search subagents to scan codebases without filling your main context',
    guide: 'subagents',
  },

  // Compaction
  {
    id: 'compact-when',
    text: 'Use /compact at logical breakpoints rather than hitting context limits mid-task',
    guide: 'compaction',
  },
  {
    id: 'compact-vs-clear',
    text: '/compact preserves key decisions in a summary, /clear starts completely fresh',
    guide: 'compaction',
  },

  // Skills
  {
    id: 'skills-intro',
    text: 'Use skills for repetitive workflows - Claude auto-applies them when your request matches',
    guide: 'skills',
  },
  {
    id: 'slash-commands',
    text: 'Create custom slash commands in .claude/commands/ for frequently used prompts',
    guide: 'skills',
  },

  // Plan mode
  {
    id: 'plan-mode-intro',
    text: 'Use plan mode (Shift+Tab twice) for complex changes - research first, then approve execution',
    guide: 'plan-mode',
  },
  {
    id: 'plan-mode-safety',
    text: 'Plan mode blocks all write tools - perfect for safely exploring unfamiliar codebases',
    guide: 'plan-mode',
  },

  // Model selection
  {
    id: 'model-selection',
    text: 'Use faster models (Sonnet, Haiku) for routine edits, save Opus or GPT-5.2 Pro for architecture and hard bugs',
    guide: 'model-selection',
  },
  {
    id: 'thinking-models',
    text: 'Use thinking models (Opus, GPT-5.2 Pro) for complex architecture decisions and tricky debugging',
    guide: 'model-selection',
  },

  // Context management
  {
    id: 'fresh-context',
    text: 'Start fresh chats for new tasks - context pollution leads to worse results',
    guide: 'context-management',
  },
  {
    id: 'scoped-prompts',
    text: 'Keep prompts short and scoped - specify exactly which files to touch',
    guide: 'context-management',
  },

  // Workflow
  {
    id: 'commit-before',
    text: 'Commit before agent sessions - easy to revert if things go wrong',
    guide: 'git-workflow',
  },
  {
    id: 'multi-agent',
    text: 'Try multi-agent workflows - run parallel agents on different branches/worktrees',
    guide: 'multi-agent',
  },
  {
    id: 'project-conventions',
    text: 'Use CLAUDE.md or .cursorrules to encode project conventions the agent should follow',
    guide: 'project-config',
  },
];

// Detailed guides rendered at /tips/[slug]
export const GUIDES: Record<string, Guide> = {
  'subagents': {
    slug: 'subagents',
    title: 'Subagents',
    description: 'Run parallel tasks in isolated contexts',
    externalDocs: 'https://code.claude.com/docs/en/sub-agents',
    tools: ['claude-code'],
    content: `
## What are Subagents?

Subagents are specialized AI assistants that handle specific tasks in their own isolated context. They prevent pollution of your main conversation and enable parallel execution.

## Key Benefits

- **Isolated Context**: Each subagent has its own context window, keeping your main conversation clean
- **Parallel Execution**: Run multiple subagents simultaneously (e.g., style-checker + security-scanner + test-coverage)
- **Granular Permissions**: Configure each subagent with specific tool access

## Try It: Exploring a New Codebase

**Scenario**: You just cloned an unfamiliar repo and want to understand how authentication works.

**Instead of this** (pollutes your context):
\`\`\`
Where is authentication handled in this codebase?
Show me the login flow
What middleware validates tokens?
\`\`\`

**Do this** (keeps context clean):
\`\`\`
Use a subagent to explore how authentication works in this
codebase. I want to understand: where login happens, how
tokens are validated, and what middleware is involved.
\`\`\`

The subagent reads dozens of files, but your main conversation stays focused. You get a clean summary without the exploration clutter.

## Creating Custom Subagents

Place subagent definitions in \`.claude/agents/\`:

\`\`\`markdown
---
name: security-scanner
description: Analyzes code for security vulnerabilities
tools: Read, Grep, Glob
---

You are a security expert. Analyze code for:
- SQL injection vulnerabilities
- XSS attack vectors
- Authentication bypasses
\`\`\`

## Best Practices

- **Give each subagent one clear goal** - input, output, and handoff rules
- **Use subagents early** - especially for exploration tasks to preserve main context
- **Limit to 3-4 subagents** - more than that can reduce your own productivity
    `,
  },

  'compaction': {
    slug: 'compaction',
    title: 'Context Compaction',
    description: 'Manage conversation length without losing important context',
    externalDocs: 'https://code.claude.com/docs/en/common-workflows',
    tools: ['claude-code'],
    content: `
## What is Compaction?

When your conversation gets long, \`/compact\` creates a summary and starts fresh with that summary as context. Unlike \`/clear\`, it preserves important decisions and state.

## /compact vs /clear

| Command | What it does |
|---------|--------------|
| \`/compact\` | Summarizes conversation, preserves key info |
| \`/clear\` | Wipes everything, completely fresh start |

## Try It: Mid-Project Reset

**Scenario**: You've been working on a feature for 30 minutes. You've made good progress, but the conversation is getting long and Claude seems to be forgetting earlier decisions.

**Step 1**: Check your context usage
\`\`\`
/context
\`\`\`

**Step 2**: If you're over 60%, compact with guidance
\`\`\`
/compact Keep: 1) We're using the repository pattern for data
access, 2) All API routes return {data, error} format,
3) Tests use the mock factory in tests/utils
\`\`\`

**Step 3**: Verify key context survived
\`\`\`
What patterns are we using for this feature?
\`\`\`

Claude should recall the decisions you preserved. If not, re-state them briefly.

## When to Compact

- **After completing a feature** - before starting the next one
- **When quality drops** - Claude forgetting things? Time to compact
- **Before hitting limits** - don't wait for auto-compact mid-task

## Tips

- **Save important plans to files** - \`docs/PLAN.md\` survives any compaction
- **Compact at natural breakpoints** - between features, not mid-implementation
    `,
  },

  'skills': {
    slug: 'skills',
    title: 'Skills & Slash Commands',
    description: 'Create reusable prompts and workflows',
    externalDocs: 'https://code.claude.com/docs/en/slash-commands',
    tools: ['claude-code'],
    content: `
## What Are They?

Slash commands are reusable prompts you invoke with \`/name\`. Skills are prompts Claude applies automatically when relevant.

## Try It: Create a Commit Command

**Step 1**: Create the file \`.claude/commands/commit.md\`:

\`\`\`markdown
---
description: Create a conventional commit
allowed-tools: Bash(git add:*), Bash(git commit:*)
---

Create a commit for staged changes. Use conventional format:
type(scope): description

Types: feat, fix, docs, style, refactor, test, chore
\`\`\`

**Step 2**: Use it:
\`\`\`
/commit
\`\`\`

Claude stages relevant files and creates a properly formatted commit.

## Try It: Quick PR Command

Create \`.claude/commands/pr.md\`:

\`\`\`markdown
---
description: Create a pull request
allowed-tools: Bash(git:*), Bash(gh:*)
---

Create a PR for the current branch. Include:
- Summary of changes (check git log)
- Test plan
Push the branch first if needed.
\`\`\`

Now \`/pr\` handles the entire PR workflow.

## Real-World Example: Sentry's Skills

Sentry maintains a [public skills repository](https://github.com/getsentry/skills) with battle-tested skills:

| Skill | What it does |
|-------|--------------|
| \`/commit\` | Commit with Sentry conventions |
| \`/create-pr\` | Create PRs following Sentry guidelines |
| \`/code-review\` | Review code using Sentry's checklist |
| \`/find-bugs\` | Find bugs and security issues in changes |
| \`/deslop\` | Remove AI-generated code slop |
| \`/iterate-pr\` | Fix CI failures until PR passes |

You can fork this repo or use it as inspiration for your own team skills.

## Skills vs Slash Commands

| | Slash Commands | Skills |
|--|----------------|--------|
| Invocation | \`/command\` | Automatic |
| Location | \`.claude/commands/\` | \`.claude/skills/\` |
| Best for | Explicit workflows | Context-aware behaviors |
    `,
  },

  'plan-mode': {
    slug: 'plan-mode',
    title: 'Plan Mode',
    description: 'Research and plan before executing changes',
    externalDocs: 'https://code.claude.com/docs/en/common-workflows',
    tools: ['claude-code'],
    content: `
## What is Plan Mode?

Plan Mode lets Claude research and plan without making changes. It can read files but not edit them until you approve.

## Try It: Planning a Refactor

**Scenario**: You want to refactor the authentication system but aren't sure of the scope.

**Step 1**: Enter plan mode (press \`Shift+Tab\` twice, or):
\`\`\`
claude --permission-mode plan
\`\`\`

**Step 2**: Ask Claude to investigate:
\`\`\`
I want to refactor auth from session-based to JWT.
Analyze the current implementation and give me a plan.
What files need to change? What's the risk?
\`\`\`

**Step 3**: Claude reads files, traces dependencies, identifies risks—but changes nothing.

**Step 4**: Review the plan. When ready:
\`\`\`
Looks good. Exit plan mode and implement step 1.
\`\`\`

## When to Use

- **Unfamiliar codebase** - explore safely before editing
- **Complex refactors** - understand scope before committing
- **High-risk changes** - auth, payments, data migrations
- **Architecture decisions** - research options first

## Quick Reference

| Action | How |
|--------|-----|
| Enter plan mode | \`Shift+Tab\` twice |
| Exit plan mode | \`Shift+Tab\` to cycle |
| Start in plan mode | \`claude --permission-mode plan\` |
    `,
  },

  'model-selection': {
    slug: 'model-selection',
    title: 'Model Selection',
    description: 'Choose the right model for each task',
    tools: ['claude-code', 'cursor'],
    content: `
## The Right Model for the Job

Fast models (Sonnet, Haiku, GPT-5 Codex) are cheap and quick. Thinking models (Opus, GPT-5.2 Pro) are slower but better at hard problems.

## Try It: Escalating When Stuck

**Scenario**: You're debugging a race condition. Sonnet keeps suggesting fixes that don't work.

**Step 1**: You've tried with Sonnet:
\`\`\`
There's a race condition in the checkout flow. Orders
sometimes get duplicated. Fix it.
\`\`\`

**Step 2**: Sonnet's fix didn't work. Escalate to Opus:
\`\`\`
/model opus

The race condition is still happening. Here's what we tried:
[paste previous attempts]. Analyze the timing more carefully.
What are we missing?
\`\`\`

Opus's deeper reasoning often catches what faster models miss.

## Quick Reference

| Task | Model |
|------|-------|
| Rename variable, fix typo | Haiku |
| Add a function, write tests | Sonnet, GPT-5 Codex |
| Debug race condition | Opus |
| Design new system | Opus, GPT-5.2 Pro |
| Bulk refactor | Sonnet |

## Rule of Thumb

Start with Sonnet or Codex. If you're going in circles after 2-3 attempts, switch to Opus or GPT-5.2 Pro.
    `,
  },

  'context-management': {
    slug: 'context-management',
    title: 'Context Management',
    description: 'Keep conversations focused for better results',
    tools: ['claude-code', 'cursor'],
    content: `
## Why It Matters

Long conversations degrade. Claude forgets earlier decisions. Quality drops. Fresh contexts give better results.

## Try It: Scoped Prompts

**Bad prompt** (vague, touches everything):
\`\`\`
Improve the authentication system
\`\`\`

**Good prompt** (specific files, clear goal):
\`\`\`
In src/auth/login.ts, add rate limiting to the login()
function. Limit to 5 attempts per minute per IP.
Use the existing redis client.
\`\`\`

The scoped prompt is faster to execute and less likely to break things.

## Try It: Fresh Start

**Scenario**: You finished adding dark mode. Now you need to fix a bug in checkout.

**Don't** continue in the same chat:
\`\`\`
Now fix the checkout bug where totals are wrong
\`\`\`

**Do** start fresh:
\`\`\`
/clear
There's a bug in src/checkout/cart.ts where totals
don't include tax. Fix the calculateTotal function.
\`\`\`

## Signs You Need a Fresh Start

- Claude forgets what you decided earlier
- Suggestions contradict previous work
- Quality dropped from conversation start
- You're past ~20 messages
    `,
  },

  'git-workflow': {
    slug: 'git-workflow',
    title: 'Git Workflow',
    description: 'Safe version control practices with AI agents',
    tools: ['claude-code', 'cursor'],
    content: `
## The Golden Rule

Commit before agent sessions. Always have a rollback point.

## Try It: Safe Agent Session

**Before starting**:
\`\`\`bash
git add -A && git commit -m "WIP: before agent session"
\`\`\`

**Ask the agent to work**:
\`\`\`
Refactor the user service to use the repository pattern
\`\`\`

**If it goes wrong**:
\`\`\`bash
git reset --hard HEAD
\`\`\`

You're back to exactly where you started.

## Try It: Branch for Big Changes

**Scenario**: Agent is doing a major refactor. You want to review before merging.

\`\`\`bash
# Create a branch
git checkout -b refactor/repository-pattern
\`\`\`

**Let the agent work**:
\`\`\`
Refactor user service to repository pattern
\`\`\`

**Review and merge**:
\`\`\`bash
# Review the changes
git diff main

# If good, merge. If bad, delete the branch.
git checkout main
git merge refactor/repository-pattern  # or: git branch -D refactor/repository-pattern
\`\`\`

## Quick Commands

| Goal | Command |
|------|---------|
| Undo all changes | \`git reset --hard HEAD\` |
| Undo one file | \`git checkout -- path/to/file\` |
| See what changed | \`git diff\` |
    `,
  },

  'multi-agent': {
    slug: 'multi-agent',
    title: 'Multi-Agent Workflows',
    description: 'Run parallel agents for faster development',
    tools: ['claude-code'],
    content: `
## What is Multi-Agent?

Run multiple Claude Code instances in parallel, each on a different branch or worktree. Double or triple your throughput.

## Try It: Feature + Tests in Parallel

**Step 1**: Create worktrees:
\`\`\`bash
git worktree add ../myapp-feature feature/new-api
git worktree add ../myapp-tests feature/new-api-tests
\`\`\`

**Step 2**: Terminal 1 - Feature work:
\`\`\`bash
cd ../myapp-feature && claude
\`\`\`
\`\`\`
Implement the new user preferences API in src/api/preferences.ts
\`\`\`

**Step 3**: Terminal 2 - Test work:
\`\`\`bash
cd ../myapp-tests && claude
\`\`\`
\`\`\`
Write tests for the user preferences API. The implementation
is being done in parallel, so check src/api/preferences.ts
for the interface.
\`\`\`

**Step 4**: Merge when both are done:
\`\`\`bash
git checkout main
git merge feature/new-api
git merge feature/new-api-tests
\`\`\`

## Tips

- **Separate concerns** - don't have agents edit the same files
- **Use clear branch names** - easy to track who's doing what
- **Merge frequently** - avoid divergence

## Cleanup

\`\`\`bash
git worktree remove ../myapp-feature
git worktree remove ../myapp-tests
\`\`\`
    `,
  },

  'project-config': {
    slug: 'project-config',
    title: 'Project Configuration',
    description: 'Encode conventions for consistent AI assistance',
    tools: ['claude-code', 'cursor'],
    content: `
## Why Configure?

A \`CLAUDE.md\` or \`.cursorrules\` file tells the AI your project's conventions. Without it, the AI guesses—and often guesses wrong.

## Try It: Create a CLAUDE.md

**Step 1**: Create \`CLAUDE.md\` in your project root:

\`\`\`markdown
# Project: MyApp

## Stack
- Next.js 14 (App Router)
- TypeScript strict
- Tailwind CSS
- Drizzle ORM + PostgreSQL

## Conventions
- Use 'use client' only when necessary
- API routes return { data, error } format
- Tests in __tests__ folders, use vitest

## Commands
\`npm run dev\` - dev server
\`npm run test\` - run tests
\`npm run build\` - production build
\`\`\`

**Step 2**: Now when you ask:
\`\`\`
Add a new API route for user preferences
\`\`\`

Claude automatically:
- Uses App Router conventions
- Returns \`{ data, error }\` format
- Adds TypeScript types
- Knows to run \`npm run test\` to verify

## What to Include

- **Stack** - frameworks, languages, databases
- **Conventions** - patterns the AI should follow
- **Commands** - how to build, test, lint
- **Gotchas** - project-specific quirks

## For Cursor

Create \`.cursorrules\` with similar content. Cursor reads it automatically.
    `,
  },
};

// Get a random tip
export function getRandomTip(): Tip {
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}

// Get guide by slug
export function getGuide(slug: string): Guide | undefined {
  return GUIDES[slug];
}

// Get all guide slugs for static generation
export function getAllGuideSlugs(): string[] {
  return Object.keys(GUIDES);
}
