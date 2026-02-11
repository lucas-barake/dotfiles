---
name: react
description: React frontend patterns, component composition, colocation, TanStack Router. Use when working with React components, TSX files, or frontend code. Triggers on .tsx files, React components, TanStack Router, cn(), className.
---

# Frontend React Patterns

## Colocation (NON-NEGOTIABLE)

### Flat Directory Structure

- **One file per component tree** - if a component has child sub-components, define them ALL in the same file
- **No matter how big the file gets** - colocation > small files
- **Only exception**: when a component has MORE THAN ONE consumer - then extract to shared location

```
# CORRECT - flat, colocated
routes/dashboard/
  -lib/
    dashboard-stats.tsx      # Contains DashboardStats + all sub-components
    use-dashboard-data.ts
  page.tsx

# WRONG - over-nested
routes/dashboard/
  -lib/
    dashboard-stats/
      index.tsx
      stat-card.tsx          # NO! Define in dashboard-stats.tsx
      stat-header.tsx        # NO! Define in dashboard-stats.tsx
```

### NO Barrel Files

- **Never create `index.ts` barrel exports** in frontend code
- Import directly from the file: `import { Thing } from "./thing.tsx"`

### TanStack Router Organization

- Directories/files prefixed with `-` are ignored as routes (recursively)
- Each route gets its own `-lib/` directory for colocated code:

```
routes/
  dashboard/
    -lib/                    # Ignored by router
      components/            # Dashboard-specific components
      hooks/                 # Dashboard-specific hooks
      atoms/                 # Dashboard-specific atoms
    page.tsx
    $id.tsx                  # Dynamic route

  experiments/
    -lib/                    # Experiments-specific code
    page.tsx
    creator/
      -lib/                  # Creator-specific code (nested)
      page.tsx
```

### DDD / Consumer Ownership

- Code lives with its **outermost consumer**
- If nested route needs something from parent, define it in parent's `-lib/`
- If multiple routes need it, move to the common ancestor's `-lib/`

```
routes/experiments/
  -lib/
    shared-experiment-utils.ts   # Used by page.tsx AND creator/page.tsx
  page.tsx
  creator/
    -lib/
      creator-only-stuff.ts      # Only used by creator
    page.tsx
```

## Component Patterns

### Atomic Presentational Components

- "Dumb" components - **only** styling and layout
- **No** business logic, side effects, or conditional rendering based on app state
- Consumer owns the behavior - dictates IF and HOW it renders

```tsx
// CORRECT - pure presentational
const Card = ({ className, children }: CardProps) => (
  <div className={cn("rounded-lg border p-4", className)}>{children}</div>
);

// WRONG - business logic in presentational component
const Card = ({ data, className }: CardProps) => {
  if (!data.isVisible) return null; // NO! Consumer decides this
  return <div className={cn("rounded-lg", className)}>{data.content}</div>;
};
```

### Compound Composition Pattern

Sub-components attached to root, all in the same file:

```tsx
// widget.tsx - EVERYTHING in one file

const Root = ({ children, className }: RootProps) => (
  <div className={cn("flex flex-col gap-2", className)}>{children}</div>
);

const Header = ({ className, ...props }: HeaderProps) => (
  <div className={cn("text-lg font-bold", className)} {...props} />
);

const Body = ({ className, ...props }: BodyProps) => (
  <div className={cn("text-sm", className)} {...props} />
);

const Footer = ({ className, ...props }: FooterProps) => (
  <div className={cn("border-t pt-2", className)} {...props} />
);

export const Widget = Object.assign(Root, { Header, Body, Footer });

// Usage:
<Widget className="max-w-md">
  <Widget.Header>Title</Widget.Header>
  <Widget.Body>Content</Widget.Body>
  <Widget.Footer>Actions</Widget.Footer>
</Widget>;
```

### Styling Strategy

- **Inline `cn()` calls** - never predeclare conditional class strings in variables
- Compute styles inside JSX

```tsx
// CORRECT
<div
  className={cn(
    "base-styles",
    isActive && "active-styles",
    variant === "primary" && "primary-styles",
  )}
/>;

// WRONG
const activeClass = isActive ? "active-styles" : "";
const variantClass = variant === "primary" ? "primary-styles" : "";
<div className={cn("base-styles", activeClass, variantClass)} />;
```

### Strict Separation of Concerns

- Simple components: styling + minimal logic is fine
- Complex components: separate styling from business logic
- Don't intertwine complex state management with presentation

## File Naming

- All files: `kebab-case.tsx`
- Components export: `PascalCase`

```
user-profile-card.tsx  →  export const UserProfileCard = ...
```
