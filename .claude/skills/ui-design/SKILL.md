# UI Design Patterns

This skill provides guidelines for creating consistent, high-quality UI components in the Abacus dashboard.

## Layout System

### PageContainer

All pages use a **full-width shell with centered content** pattern. The `<PageContainer>` component constrains content to `max-w-7xl` (1280px) with responsive padding.

```tsx
import { PageContainer } from '@/components/PageContainer';

// Full-width wrapper with border, centered content
<header className="border-b border-white/5">
  <PageContainer className="py-4">
    {/* Header content aligned to max-width */}
  </PageContainer>
</header>

// Main content
<main className="py-4 sm:py-8">
  <PageContainer>
    {/* Page content */}
  </PageContainer>
</main>
```

**Key principles:**
- Borders, backgrounds, and gradients span full-width on the outer wrapper
- Content is centered and constrained via `PageContainer`
- Padding is applied via `PageContainer` className, not the outer wrapper
- Use `py-*` for vertical padding on the className prop

### Responsive Breakpoints

| Screen | Behavior |
|--------|----------|
| Mobile (<640px) | Full-width with 16px padding |
| Tablet/Laptop (640-1280px) | Full-width with 32px padding |
| Desktop (1280px+) | Centered at 1280px max |

### Page Structure Template

Every page should follow this structure:

```tsx
<div className="min-h-screen bg-[#0a0a0f] text-white grid-bg">
  {/* Loading Progress Bar (optional) */}
  {isRefreshing && (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-amber-500/20 overflow-hidden">
      <div className="h-full bg-amber-500 animate-progress" />
    </div>
  )}

  {/* Header - full-width border, centered content */}
  <header className="relative z-20 border-b border-white/5">
    <PageContainer className="py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <MainNav days={days} />
        <UserMenu />
      </div>
    </PageContainer>
  </header>

  {/* TipBar - uses PageContainer internally */}
  <TipBar />

  {/* Optional: Subheader/toolbar sections */}
  <div className="border-b border-white/5">
    <PageContainer className="py-3">
      {/* Section content */}
    </PageContainer>
  </div>

  {/* Main Content */}
  <main className="relative z-10 py-4 sm:py-8">
    <PageContainer>
      {/* Page content */}
    </PageContainer>
  </main>
</div>
```

### Special Cases

**Article/Detail Pages** (e.g., tips detail): Use a narrower max-width for readability:
```tsx
<main className="py-8 sm:py-12">
  <PageContainer>
    <div className="max-w-2xl mx-auto">
      {/* Article content */}
    </div>
  </PageContainer>
</main>
```

**Full-width accent backgrounds:**
```tsx
<div className="border-b border-white/5 bg-gradient-to-r from-amber-500/[0.03] via-transparent to-transparent">
  <PageContainer className="py-2">
    {/* Content with accent background */}
  </PageContainer>
</div>
```

## Time Range Annotations

**IMPORTANT:** All time-relative data must clearly indicate the time range to avoid confusion between relative and absolute values.

### Pattern 1: Inline annotation in label
Use the `days` prop on components to show "(30d)" inline:
```tsx
// Section headers
<h3 className="font-mono text-xs uppercase tracking-wider text-white/60">
  Top Users <span className="text-white/30">({days}d)</span>
</h3>

// StatCard with days prop
<StatCard
  label="Active Users"
  days={days}  // Shows "(30d)" after label
  value="42"
/>
```

### Pattern 2: Descriptive subValue
Use for stat cards with more space:
```tsx
<StatCard
  label="Total Tokens"
  value="1.2M"
  subValue="Last 30 days"  // Descriptive text below value
/>
```

### When to use each pattern:
- **Inline (30d)**: Compact displays, section headers, tables
- **Descriptive subValue**: Primary stat cards with space for context

## Components

### StatCard

The `StatCard` component displays key metrics consistently across the app.

```tsx
import { StatCard } from '@/components/StatCard';
import { TrendingUp } from 'lucide-react';

// Basic stat card (with left accent bar)
<StatCard
  label="Total Tokens"
  value="1.2M"
  subValue="Last 30 days"
  accentColor="#f59e0b"
/>

// Stat card with icon (replaces accent bar with corner gradient)
<StatCard
  label="Avg Score"
  days={30}
  value="72"
  suffix="/100"
  icon={TrendingUp}
  accentColor="#10b981"
/>

// Stat card with custom children
<StatCard
  label="Active Users"
  days={30}
  value="156"
  suffix="users"
  icon={Users}
  accentColor="#06b6d4"
>
  {/* Custom content below value */}
  <div className="flex gap-2">
    <span className="text-amber-400">42 high</span>
    <span className="text-cyan-400">89 med</span>
  </div>
</StatCard>
```

**StatCard Props:**
| Prop | Type | Description |
|------|------|-------------|
| `label` | string | Card label/title |
| `days` | number | Time range - shows "(Nd)" after label |
| `value` | string | Main value to display |
| `suffix` | string | Text after value (e.g., "/100", "users") |
| `subValue` | string | Sub-text below value |
| `trend` | number | Trend percentage with arrow |
| `accentColor` | string | Accent color (hex) |
| `icon` | LucideIcon | Icon component - changes to corner gradient style |
| `delay` | number | Animation delay |
| `children` | ReactNode | Custom content below value |

**Style variants:**
- **Without icon**: Left accent bar, compact layout
- **With icon**: Corner gradient decoration, icon next to label

### Content Cards

For charts, tables, and lists - use the standard card wrapper:

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.4 }}
  className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
>
  <div className="mb-4 flex items-center justify-between">
    <h3 className="font-mono text-xs uppercase tracking-wider text-white/60">
      Section Title <span className="text-white/30">({days}d)</span>
    </h3>
    <Link href="/more" className="font-mono text-xs text-amber-500">
      View All →
    </Link>
  </div>
  {/* Content */}
</motion.div>
```

### Tables

```tsx
<div className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="border-b border-white/10 bg-white/[0.02]">
          <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-white/60 text-left">
            Column
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
          <td className="px-4 py-3 font-mono text-xs text-white/70">
            Value
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

## Color System

### Background
- Primary: `bg-[#0a0a0f]`
- Card/Panel: `bg-white/[0.02]`
- Hover: `bg-white/[0.03]`

### Borders
- Default: `border-white/5`
- Hover: `border-white/10`
- Dashed: `border-dashed border-white/10`

### Text
- Primary: `text-white`
- Secondary: `text-white/70`
- Muted: `text-white/40`
- Disabled: `text-white/30`

### Accent Colors
| Color | Use | CSS |
|-------|-----|-----|
| Amber | Claude Code, primary accent | `#f59e0b`, `text-amber-400` |
| Cyan | Cursor, secondary accent | `#06b6d4`, `text-cyan-400` |
| Emerald | Success, positive trends | `#10b981`, `text-emerald-400` |
| Violet | Tertiary, special features | `#8b5cf6`, `text-violet-400` |

## Typography

### Font Families
- Display: `font-display` - Headings, large numbers
- Mono: `font-mono` - Data, labels, code

### Common Patterns
```tsx
// Page title
<h1 className="font-display text-2xl sm:text-3xl text-white">Title</h1>

// Section label
<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
  Label
</p>

// Stat value
<span className="font-display text-3xl text-white">42.1M</span>

// Data cell
<span className="font-mono text-xs text-white/70">value</span>
```

## Animation

Use Framer Motion for page-level animations:
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1 }}
>
  {/* Content */}
</motion.div>
```

Stagger delays for multiple items:
```tsx
{items.map((item, i) => (
  <StatCard key={item.id} delay={i * 0.1} ... />
))}
```

## Checklist for New Pages

- [ ] Uses `PageContainer` for all content sections
- [ ] Header with `MainNav` and `UserMenu`
- [ ] Includes `TipBar` below header
- [ ] Full-width borders/backgrounds with centered content
- [ ] Responsive padding (py-4 sm:py-8 for main)
- [ ] Loading state with progress bar
- [ ] Error state handling
- [ ] Mobile-first responsive design
- [ ] Time range annotations on all time-relative data
- [ ] Uses `StatCard` for metric displays
