# Task 2: `ui`-Paket mit einer Komponente füllen

## 🎯 Ziel

Das `@starter-kit/ui`-Paket lauffähig machen, indem wir eine erste, grundlegende UI-Komponente (`Button`) erstellen und korrekt aus dem Paket exportieren. Dies schafft ein Muster für alle zukünftigen UI-Komponenten.

## 📝 Kontext

Gemäß der `WARP.md` ist `packages/ui` der zentrale Ort für alle wiederverwendbaren React-Komponenten. Aktuell ist das Paket leer und kann nicht verwendet werden. Durch das Hinzufügen einer `Button.tsx`-Komponente und einer `index.ts`-Exportdatei wird das Paket funktional und kann in der `apps/web`-Anwendung importiert werden. Wir fügen bewusst eine einfache, generische Komponente hinzu, um die grundlegende Funktionalität des Monorepo-Setups zu validieren.

## 🛠️ Implementierung

### 1. `Button`-Komponente erstellen

Erstelle die folgende Datei. Sie enthält eine einfache, aber vollständige React-Button-Komponente mit TypeScript-Props und grundlegendem Styling.

**Datei:** `packages/ui/src/Button.tsx`

```tsx
import * as React from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <button
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 bg-slate-900 text-slate-50 shadow hover:bg-slate-900/90 h-9 px-4 py-2 ${className}`}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
```

### 2. Komponente aus dem Paket exportieren

Erstelle die `index.ts`-Datei, die als Haupteinstiegspunkt für das `ui`-Paket dient. Der `"use client";`-Zusatz ist wichtig, damit Next.js die Komponenten korrekt als Client-Komponenten erkennt.

**Datei:** `packages/ui/index.ts`

```typescript
"use client";

export * from "./src/Button";
```

## ✅ Verifizierung

Führe nach dem Anwenden der Änderungen den Build-Befehl im Root-Verzeichnis aus:

```bash
npm run build
```

Dieser Befehl wird versuchen, alle Pakete im Monorepo zu bauen. Der Build-Prozess sollte erfolgreich und ohne Fehler, die sich auf `@starter-kit/ui` beziehen, abgeschlossen werden. Dies bestätigt, dass das Paket jetzt korrekt strukturiert ist.

