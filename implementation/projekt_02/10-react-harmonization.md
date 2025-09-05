# Arbeitspaket 02: React Version Harmonisierung

## Ziel
Harmonisierung der React Versionen zwischen allen Packages auf React 19, um Kompatibilitätsprobleme zu vermeiden.

## Problem
- **UI Package** nutzt React 18 Types
- **Web App** nutzt React 19
- Dies kann zu Type Mismatches und Runtime Errors führen

## Kontext
- **Betroffene Packages**: 
  - `packages/ui` (React 18)
  - `apps/web` (React 19)
- **Root package.json** hat bereits React 19
- **React 19 Requirements**: 
  - Neue JSX Transform ist erforderlich (react-jsx)
  - TypeScript Types müssen auf Version 19 aktualisiert werden
  - Offiziell empfohlene Versionen laut React Dokumentation

## Implementierung

### Schritt 1: UI Package auf React 19 updaten
In `packages/ui/package.json`:

```json
{
  "name": "@starter-kit/ui",
  "version": "0.0.0",
  "private": true,
  "exports": {
    ".": "./index.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "15.1.3",
    "typescript": "^5"
  }
}
```

### Schritt 2: Alle anderen Packages prüfen und aktualisieren
Prüfe und update in folgenden Dateien falls React Dependencies vorhanden:
- `packages/auth/package.json`
- `packages/api/package.json` 
- `packages/ai-adapter/package.json`
- `packages/agentic-workflows/package.json`

Template für Package mit React Dependency:
```json
{
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

### Schritt 3: Root Dependencies updaten
In root `package.json` sicherstellen:

```json
{
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

**Hinweis**: Die offizielle React Dokumentation empfiehlt die Installation mit `--save-exact` für exakte Versionen:
```bash
npm install --save-exact react@^19.0.0 react-dom@^19.0.0
npm install --save-exact @types/react@^19.0.0 @types/react-dom@^19.0.0
```

### Schritt 4: Lock File neu generieren
```bash
# Alte node_modules und lock file löschen
rm -rf node_modules package-lock.json
rm -rf apps/*/node_modules packages/*/node_modules

# Neu installieren
npm install
```

### Schritt 5: TypeScript Konfiguration prüfen
In `packages/ui/tsconfig.json` sicherstellen:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",  // WICHTIG: Neue JSX Transform für React 19
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",  // Empfohlen für moderne Build Tools
    "types": ["react", "react-dom"]
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

**React 19 JSX Transform Warnung**: Falls die neue Transform nicht aktiviert ist, erscheint:
```
Your app (or one of its dependencies) is using an outdated JSX transform. 
Update to the modern JSX transform for faster performance.
```

## Verifizierung

### Test 1: Build Test
```bash
npm run build
# Sollte ohne React Version Warnings durchlaufen
```

### Test 2: Type Check
```bash
npm run type-check
# Keine TypeScript Errors bezüglich React Types
```

### Test 3: Component Import Test
Erstelle `test-import.tsx` in apps/web:
```tsx
import { Button } from '@starter-kit/ui';

export function TestComponent() {
  return <Button onClick={() => console.log('Test')}>Test React 19</Button>;
}
```

### Test 4: Version Verification
```bash
npm ls react
# Sollte nur React 19 Versionen zeigen
```

## Erfolgskriterien
- [ ] Alle Packages nutzen React 19
- [ ] Keine React Version Mismatches in npm ls
- [ ] Build läuft ohne Warnings durch
- [ ] Type Check zeigt keine React Type Errors
- [ ] UI Components funktionieren in Web App
- [ ] Neue JSX Transform ist aktiv (kein Transform Warning)
- [ ] TypeScript Versionen sind konsistent (@types/react@^19.0.0)
- [ ] Testing Library v16.3.0+ installiert (React 19 Support)
- [ ] Alle Tests laufen erfolgreich durch

## Potentielle Probleme

### Problem: Peer Dependency Warnings
**Lösung**: Stelle sicher dass peerDependencies korrekt gesetzt sind

### Problem: Type Errors nach Update
**Lösung**: 
```bash
# TypeScript Cache löschen
rm -rf packages/*/.turbo apps/*/.turbo
rm -rf packages/*/tsconfig.tsbuildinfo
npm run type-check
```

### Problem: Build Fehler
**Lösung**: Prüfe ob alle @types packages auf Version 19 sind

### Problem: JSX Transform Warning
**Lösung**: Stelle sicher dass `"jsx": "react-jsx"` in allen tsconfig.json Dateien gesetzt ist

### Problem: TypeScript Errors nach Update
**Zusätzliche Lösung**: React 19 hat einige Breaking Changes in den Types:
- `ReactNode` Type wurde angepasst
- `children` prop muss explizit definiert werden
- Einige deprecated APIs wurden entfernt

## Rollback Plan
```bash
git checkout -- package.json packages/*/package.json apps/*/package.json
npm install
```

## Zeitschätzung
- Package Updates: 15 Minuten
- Dependency Installation: 10 Minuten
- Testing: 15 Minuten
- Total: 40 Minuten

## Referenzen
- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [React 19 Release Notes](https://react.dev/blog/2024/12/05/react-19)
- [New JSX Transform Documentation](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)