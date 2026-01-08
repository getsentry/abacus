# UI Design System

Comprehensive design guidelines for the Abacus dashboard. This document covers color palette, typography, components, and patterns to ensure consistency across the application.

## Color System

### Background Colors

| Usage | Class | Value |
|-------|-------|-------|
| Page background | `bg-[#050507]` | Near-black |
| Card/Panel | `bg-white/[0.02]` | 2% white |
| Hover state | `bg-white/[0.03]` | 3% white |
| Active/Selected | `bg-white/5` | 5% white |
| Subtle highlight | `bg-white/10` | 10% white |

### Border Colors

| Usage | Class |
|-------|-------|
| Default | `border-white/5` |
| Hover | `border-white/10` |
| Input focus | `border-white/30` |
| Active/Selected | `border-amber-500/30` |

### Text Opacity Scale

This is the core contrast system. Use these consistently:

| Opacity | Class | Use Case |
|---------|-------|----------|
| 100% | `text-white` | Primary content, headings, important values |
| 90% | `text-white/90` | Body text, commit messages |
| 70% | `text-white/70` or `text-secondary` | Secondary content, table data |
| 60% | `text-white/60` | Section labels, headers |
| 50% | `text-white/50` or `text-muted` | Tertiary info, sub-values |
| 40% | `text-white/40` | Metadata, timestamps, badges |
| 30% | `text-white/30` | Disabled, very subtle hints |
| 20% | `text-white/20` | Icons in empty states |

**Key principle**: Higher contrast (70%+) for actionable/important content, lower contrast (40%-) for metadata/supporting info.

### Semantic Text Classes

Defined in `globals.css` for consistency:
```css
.text-primary   /* rgba(255,255,255,1) - white */
.text-secondary /* rgba(255,255,255,0.7) - white/70 */
.text-muted     /* rgba(255,255,255,0.5) - white/50 */
```

### Tool/Brand Colors

Defined in `src/lib/tools.ts`:

| Tool | Background | Text | Usage |
|------|------------|------|-------|
| Claude Code | `bg-amber-500` | `text-amber-400` | Primary accent |
| Cursor | `bg-cyan-500` | `text-cyan-400` | Secondary accent |
| Windsurf | `bg-emerald-500` | `text-emerald-400` | |
| GitHub Copilot | `bg-sky-500` | `text-sky-400` | |
| Unknown | `bg-rose-500` | `text-rose-400` | Fallback |
| Human/None | `bg-white/20` | `text-white/50` | Non-AI |

### Semantic Colors

| Purpose | Class |
|---------|-------|
| Success/Positive | `text-emerald-400` |
| Error/Negative | `text-red-400` |
| Warning | `text-amber-400` |
| Info/Link | `text-cyan-400` |

### Adoption Stage Colors

| Stage | Background | Border | Text |
|-------|------------|--------|------|
| Exploring | `bg-slate-500/10` | `border-slate-500/20` | `text-slate-400` |
| Building Momentum | `bg-amber-500/10` | `border-amber-500/20` | `text-amber-400` |
| In the Flow | `bg-cyan-500/10` | `border-cyan-500/20` | `text-cyan-400` |
| Power User | `bg-emerald-500/10` | `border-emerald-500/20` | `text-emerald-400` |
| Inactive | `bg-zinc-500/10` | `border-zinc-500/20` | `text-zinc-400` |

## Typography

### Font Families

```tsx
font-display  // 'Outfit' - Headings, large numbers, display text
font-mono     // 'Geist Mono' - Data, labels, code, most UI text
```

### Common Patterns

```tsx
// Page title
<h1 className="font-display text-2xl sm:text-3xl text-white">Title</h1>

// Section label (use SectionLabel component)
<h3 className="font-mono text-[11px] uppercase tracking-wider text-secondary">
  Section Title
</h3>

// Stat value (large number)
<span className="font-display text-3xl font-light tracking-tight text-white">42.1M</span>

// Data/table cell
<span className="font-mono text-xs text-white/70">value</span>

// Small label/badge
<span className="font-mono text-[10px] uppercase tracking-wider text-white/40">LABEL</span>

// Metadata annotation
<span className="font-mono text-[11px] text-white/40">Data from Oct 2024</span>
```

### Font Sizes

| Size | Class | Use |
|------|-------|-----|
| 8px | `text-[8px]` | Chart axis labels |
| 9px | `text-[9px]` | Tiny badges |
| 10px | `text-[10px]` | Small labels, uppercase headers |
| 11px | `text-[11px]` | Section labels, metadata |
| xs (12px) | `text-xs` | Body text, table data |
| sm (14px) | `text-sm` | Emphasized body text |
| base+ | `text-lg` to `text-3xl` | Display values |

## Components

### Card

Standard container for content sections.

```tsx
import { Card, AnimatedCard } from '@/components/Card';

// Basic card
<Card>Content</Card>

// With padding options: none, sm (default), md, lg
<Card padding="lg">Content</Card>

// Animated on mount
<AnimatedCard delay={0.1}>Content</AnimatedCard>

// For tables (no padding, overflow hidden)
<Card padding="none" className="overflow-hidden">
  <table>...</table>
</Card>
```

### SectionLabel / CardTitle

Consistent section headers.

```tsx
import { SectionLabel, CardTitle } from '@/components/SectionLabel';

// Basic
<SectionLabel>Daily Usage</SectionLabel>

// With time range annotation: "Daily Usage (30d)"
<SectionLabel days={30}>Daily Usage</SectionLabel>

// With count: "Commits (1,234)"
<SectionLabel count={1234}>Commits</SectionLabel>

// With margin
<SectionLabel margin="lg">Title</SectionLabel>

// With divider line
<SectionLabel divider margin="lg">Title</SectionLabel>

// CardTitle = SectionLabel with margin="lg" default (for use inside Cards)
<CardTitle days={30}>Section</CardTitle>
```

### StatCard

Display key metrics.

```tsx
import { StatCard } from '@/components/StatCard';

// Basic with accent bar
<StatCard
  label="Total Tokens"
  value="1.2M"
  subValue="Last 30 days"
  accentColor="#f59e0b"
/>

// With icon (changes to corner gradient style)
<StatCard
  label="Active Users"
  days={30}
  value="156"
  icon={Users}
  trend={12}
  accentColor="#06b6d4"
/>

// With custom children
<StatCard label="Score" value="72" suffix="/100">
  <div className="flex gap-2 text-xs">
    <span className="text-emerald-400">+5 this week</span>
  </div>
</StatCard>
```

### PageState Components

Loading, error, and empty states.

```tsx
import { LoadingState, ErrorState, EmptyState } from '@/components/PageState';

<LoadingState message="Loading data..." />

<ErrorState message="Failed to fetch" />

<EmptyState
  icon={Inbox}
  title="No commits found"
  description="Try adjusting your filters"
/>
```

### LoadingBar

Top-of-page progress indicator.

```tsx
import { LoadingBar } from '@/components/LoadingBar';

<LoadingBar isLoading={isRefreshing} />
```

### Tooltip

Hover tooltips.

```tsx
import { Tooltip, TooltipContent, TooltipRow } from '@/components/Tooltip';

// Simple wrapper
<Tooltip content="Helpful text">
  <button>Hover me</button>
</Tooltip>

// Manual with group
<div className="group relative">
  <button>Hover</button>
  <TooltipContent>
    <TooltipRow label="Date" className="text-white/60">Jan 5</TooltipRow>
    <TooltipRow label="Tokens" className="text-amber-400">1.2M</TooltipRow>
  </TooltipContent>
</div>
```

### AdoptionBadge

User adoption stage indicator.

```tsx
import { AdoptionBadge } from '@/components/AdoptionBadge';

<AdoptionBadge stage="power_user" />
<AdoptionBadge stage="exploring" size="sm" showLabel={false} />
<AdoptionBadge stage="in_flow" isInactive />
```

### TimeRangeSelector

Time range picker buttons.

```tsx
import { TimeRangeSelector } from '@/components/TimeRangeSelector';

<TimeRangeSelector
  value={range}
  onChange={setRange}
  options={[7, 30, 90]}
  isPending={isLoading}
/>
```

## Layout System

### PageContainer

All pages use centered, max-width content.

```tsx
import { PageContainer } from '@/components/PageContainer';

// Full-width wrapper with centered content
<header className="border-b border-white/5">
  <PageContainer className="py-4">
    {/* Content constrained to 1280px */}
  </PageContainer>
</header>
```

### Page Structure Template

```tsx
<div className="min-h-screen bg-[#050507] text-white">
  {/* Loading bar */}
  <LoadingBar isLoading={isRefreshing} />

  {/* App header */}
  <AppHeader />

  {/* Tip bar (optional) */}
  <TipBar />

  {/* Page-specific header */}
  <div className="border-b border-white/5">
    <PageContainer className="py-6">
      <h1 className="font-display text-2xl text-white">Page Title</h1>
    </PageContainer>
  </div>

  {/* Main content */}
  <main className="py-8">
    <PageContainer>
      <div className="space-y-8">
        {/* Content sections */}
      </div>
    </PageContainer>
  </main>
</div>
```

### Responsive Breakpoints

| Screen | Container | Padding |
|--------|-----------|---------|
| < 640px | Full width | 16px (px-4) |
| 640-1280px | Full width | 32px (px-8) |
| 1280px+ | 1280px max | Centered |

## Interactive Elements

### Buttons

```tsx
// Primary action (amber accent)
<button className="px-3 py-1.5 rounded font-mono text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
  Action
</button>

// Secondary/Inactive
<button className="px-3 py-1.5 rounded font-mono text-xs bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60">
  Secondary
</button>

// Disabled
<button className="opacity-30 cursor-not-allowed" disabled>
  Disabled
</button>
```

### Links

```tsx
import { AppLink } from '@/components/AppLink';

// Internal link (preserves time range query params)
<AppLink href="/users" className="text-amber-400 hover:text-amber-300">
  View Users
</AppLink>

// Back link pattern
<AppLink
  href="/commits"
  className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/60 transition-colors"
>
  <ArrowLeft className="w-4 h-4" />
  <span className="font-mono text-xs">All Repositories</span>
</AppLink>
```

### Select/Dropdown

```tsx
<select className="bg-[#0a0a0c] border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-white/60 focus:outline-none focus:border-white/30">
  <option value="all" className="bg-[#0a0a0c]">All</option>
  <option value="ai" className="bg-[#0a0a0c]">AI only</option>
</select>
```

## Tables

```tsx
<Card padding="none" className="overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="border-b border-white/10 bg-white/[0.02]">
          {/* Flexible column */}
          <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/60">
            Name
          </th>
          {/* Fixed width columns */}
          <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/60 w-24">
            Tokens
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
          <td className="px-4 py-3">
            <span className="font-mono text-xs text-white/70 truncate block">user@example.com</span>
          </td>
          <td className="px-4 py-3 text-right w-24 whitespace-nowrap">
            <span className="font-mono text-xs text-white/60">1.2M</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</Card>
```

### Column Width Guidelines

| Type | Width | Class |
|------|-------|-------|
| Primary (name/email) | Flexible | None + `truncate` |
| Status/Badge | 128px | `w-32` |
| Score | 80px | `w-20` |
| Tokens/Currency | 96px | `w-24` |
| Date | 112px | `w-28` |
| Percentage | 80px | `w-20` |

## Animation

Use Framer Motion for page animations:

```tsx
import { motion } from 'framer-motion';

// Fade up on mount
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, delay: 0.1 }}
>
  Content
</motion.div>

// Stagger children
{items.map((item, i) => (
  <StatCard key={item.id} delay={i * 0.1} />
))}
```

## Icons

Use Lucide React icons consistently:

```tsx
import { GitCommit, Users, Calendar, ArrowLeft, ExternalLink, Database } from 'lucide-react';

// Standard size in UI
<Icon className="w-4 h-4 text-white/40" />

// Small/inline
<Icon className="w-3 h-3 text-white/30" />

// Large/empty state
<Icon className="w-8 h-8 text-white/20" />
```

## Time Range Annotations

All time-relative data must show the time range:

```tsx
// In section headers (use SectionLabel)
<SectionLabel days={30}>Active Users</SectionLabel>
// Renders: "ACTIVE USERS (30d)"

// In stat cards
<StatCard label="Tokens" days={30} value="1.2M" />

// Manual annotation
<span className="text-white/30">({days}d)</span>
```

## Checklist for New Pages

- [ ] Uses `PageContainer` for all content sections
- [ ] Has `AppHeader` component
- [ ] Includes `TipBar` if appropriate
- [ ] Full-width borders/backgrounds with centered content
- [ ] Responsive padding (`py-4 sm:py-8` for main)
- [ ] `LoadingBar` for refresh states
- [ ] `LoadingState` / `ErrorState` / `EmptyState` for data states
- [ ] Time range annotations on all time-relative data
- [ ] Uses shared components (`Card`, `StatCard`, `SectionLabel`)
- [ ] Consistent text opacity scale
- [ ] Uses `AppLink` for internal navigation
- [ ] Animation with Framer Motion (staggered delays)
- [ ] Mobile-first responsive design
