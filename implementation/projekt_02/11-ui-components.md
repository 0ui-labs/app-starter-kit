# Arbeitspaket 07: UI Component Library vervollständigen (shadcn/ui v4)

## Ziel
Aufbau einer vollständigen, wiederverwendbaren UI Component Library basierend auf shadcn/ui v4 mit TypeScript, Tailwind CSS v4, Radix UI Primitives und Best Practices für Accessibility.

## Problem
- Nur Button Component vorhanden (aber nicht v4 konform)
- Fehlende Core Components (Input, Card, Label, Badge, etc.)
- Keine Radix UI Integration
- Fehlende Utility Functions (cn, etc.)
- Keine `data-slot` Attributes für besseres Styling
- Veraltete Tailwind Patterns

## Kontext
- **Package**: `@starter-kit/ui`
- **Base**: shadcn/ui v4 Components
- **Primitives**: Radix UI für komplexe Interaktionen
- **Styling**: Tailwind CSS v4 mit modernen Patterns
- **TypeScript**: Strict mode mit proper types
- **React**: Version 19
- **Accessibility**: ARIA compliant mit Radix UI

## Implementierung

### Schritt 1: Dependencies hinzufügen
Update `packages/ui/package.json`:

```json
{
  "name": "@starter-kit/ui",
  "version": "0.0.0",
  "main": "./index.ts",
  "types": "./index.ts",
  "scripts": {
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-slot": "^1.0.2",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "react": "^18.2.0",
    "typescript": "^5.3.0"
  },
  "peerDependencies": {
    "react": ">=18"
  }
}
```

### Schritt 2: Utility Functions
Erstelle `packages/ui/src/lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Schritt 3: Button Component (v4 konform)
Update `packages/ui/src/components/button.tsx`:

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

### Schritt 4: Input Component (v4 konform)
Erstelle `packages/ui/src/components/input.tsx`:

```typescript
import * as React from "react";
import { cn } from "../lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
```

### Schritt 5: Card Component (v4 konform)
Erstelle `packages/ui/src/components/card.tsx`:

```typescript
import * as React from "react";
import { cn } from "../lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
```

### Schritt 6: Label Component (v4 konform mit Radix)
Erstelle `packages/ui/src/components/label.tsx`:

```typescript
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "../lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Label };
```

### Schritt 7: Badge Component (v4 konform)
Erstelle `packages/ui/src/components/badge.tsx`:

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
```

### Schritt 8: Textarea Component (v4 konform)
Erstelle `packages/ui/src/components/textarea.tsx`:

```typescript
import * as React from "react";
import { cn } from "../lib/utils";

function Textarea({ 
  className, 
  ...props 
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground dark:bg-input/30 border-input flex min-h-[60px] w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
```

### Schritt 9: Separator Component
Erstelle `packages/ui/src/components/separator.tsx`:

```typescript
import * as React from "react";
import { cn } from "../lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}) {
  return (
    <div
      data-slot="separator"
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  );
}

export { Separator };
```

### Schritt 10: Update Package Exports
Update `packages/ui/index.ts`:

```typescript
"use client";

// Components
export * from "./src/components/button";
export * from "./src/components/input";
export * from "./src/components/card";
export * from "./src/components/label";
export * from "./src/components/badge";
export * from "./src/components/textarea";
export * from "./src/components/separator";

// Utilities
export { cn } from "./src/lib/utils";
```

### Schritt 11: Tailwind CSS v4 Integration
Erstelle `packages/ui/src/styles/globals.css`:

```css
@import "tailwindcss";

/* Theme Variables für shadcn/ui v4 */
@theme {
  --color-background: 0 0% 100%;
  --color-foreground: 0 0% 3.9%;
  --color-card: 0 0% 100%;
  --color-card-foreground: 0 0% 3.9%;
  --color-popover: 0 0% 100%;
  --color-popover-foreground: 0 0% 3.9%;
  --color-primary: 0 0% 9%;
  --color-primary-foreground: 0 0% 98%;
  --color-secondary: 0 0% 96.1%;
  --color-secondary-foreground: 0 0% 9%;
  --color-muted: 0 0% 96.1%;
  --color-muted-foreground: 0 0% 45.1%;
  --color-accent: 0 0% 96.1%;
  --color-accent-foreground: 0 0% 9%;
  --color-destructive: 0 84.2% 60.2%;
  --color-destructive-foreground: 0 0% 98%;
  --color-border: 0 0% 89.8%;
  --color-input: 0 0% 89.8%;
  --color-ring: 0 0% 3.9%;
  
  --radius: 0.5rem;
}

/* Dark Mode Theme */
@media (prefers-color-scheme: dark) {
  @theme {
    --color-background: 0 0% 3.9%;
    --color-foreground: 0 0% 98%;
    --color-card: 0 0% 3.9%;
    --color-card-foreground: 0 0% 98%;
    --color-popover: 0 0% 3.9%;
    --color-popover-foreground: 0 0% 98%;
    --color-primary: 0 0% 98%;
    --color-primary-foreground: 0 0% 9%;
    --color-secondary: 0 0% 14.9%;
    --color-secondary-foreground: 0 0% 98%;
    --color-muted: 0 0% 14.9%;
    --color-muted-foreground: 0 0% 63.9%;
    --color-accent: 0 0% 14.9%;
    --color-accent-foreground: 0 0% 98%;
    --color-destructive: 0 62.8% 30.6%;
    --color-destructive-foreground: 0 0% 98%;
    --color-border: 0 0% 14.9%;
    --color-input: 0 0% 14.9%;
    --color-ring: 0 0% 83.1%;
  }
}
```

### Schritt 12: TypeScript Configuration
Update `packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "target": "ES2020",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "index.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## Installation & Setup

```bash
# Im Root Directory
npm install

# Dependencies für ui package installieren
cd packages/ui
npm install

# Zurück zum Root
cd ../..

# Build überprüfen
npm run build
```

## Verwendung in der App

```tsx
// In apps/web/app/page.tsx oder einer anderen Component
import { 
  Button, 
  Input, 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  Label,
  Badge,
  cn 
} from '@starter-kit/ui';

export function ExampleComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>shadcn/ui v4 Components</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input 
            id="email" 
            type="email" 
            placeholder="name@example.com" 
          />
        </div>
        
        <div className="flex gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        
        <div className="flex gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Error</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
```

## Verifizierung

### Test 1: Build Check
```bash
npm run build
# Sollte ohne Fehler durchlaufen
```

### Test 2: Type Check
```bash
npm run type-check
# TypeScript sollte keine Fehler melden
```

### Test 3: Lint Check
```bash
npm run lint
# Keine Lint-Fehler
```

### Test 4: Component Rendering
Erstelle eine Test-Seite in `apps/web/app/test/page.tsx` und importiere alle Components, um sicherzustellen, dass sie korrekt rendern.

### Test 5: Accessibility Check
Teste mit Screen Reader und Keyboard Navigation:
- Tab-Navigation funktioniert
- ARIA-Attributes sind korrekt
- Focus-States sind sichtbar

## Erfolgskriterien
- [x] shadcn/ui v4 konforme Components
- [x] Radix UI Integration für Label
- [x] `data-slot` Attributes für alle Components
- [x] Modern Focus States (`ring-[3px]`)
- [x] TypeScript Types vollständig
- [x] Tailwind CSS v4 Patterns
- [x] `cn` Utility Function verfügbar
- [x] Accessibility Standards (ARIA)
- [x] Package exports funktionieren
- [x] Keine Build/Lint Errors

## Unterschiede zu v3/älteren Versionen
- **Keine `forwardRef`** für einfache Components
- **`data-slot` Attributes** für besseres Styling
- **Radix UI Primitives** für komplexe Components
- **Moderne Focus States** mit `ring-[3px]`
- **Tailwind v4 `@theme`** statt Config-Datei
- **Direkte Function Components** statt Class Components
- **`has-` und `aria-` Selectors** für conditional styling

## Potentielle Probleme & Lösungen

### Problem: Tailwind Classes nicht angewandt
**Lösung**: Stelle sicher, dass das ui package im tailwind.config content array ist:
```typescript
// apps/web/tailwind.config.ts
content: [
  './app/**/*.{ts,tsx}',
  '../../packages/ui/src/**/*.{ts,tsx}',
]
```

### Problem: Radix UI Types fehlen
**Lösung**: Installiere @types/react als devDependency

### Problem: CSS Variables nicht definiert
**Lösung**: Importiere globals.css in der Root-Layout der App

## Nächste Schritte
1. Weitere Components nach Bedarf hinzufügen (Dialog, Dropdown, Toast, etc.)
2. Storybook Integration für Component Documentation
3. Unit Tests mit Vitest und Testing Library
4. Dark Mode Toggle Component

## Zeitschätzung
- Dependencies & Setup: 15 Minuten
- Component Implementation: 60 Minuten  
- Testing & Verification: 30 Minuten
- Total: ~105 Minuten