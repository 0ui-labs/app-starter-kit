# Task 7: Test-Framework installieren und konfigurieren

## 🎯 Ziel

Eine robuste Testumgebung für das gesamte Monorepo aufsetzen, indem `vitest` als Test-Runner und `jsdom` für das Testen von UI-Komponenten im Node.js-Umfeld installiert und konfiguriert werden.

## 📝 Kontext

Ein Starter-Kit ohne Test-Framework ist unvollständig. Tests sind entscheidend, um die Stabilität des Codes bei Änderungen sicherzustellen. `vitest` ist eine moderne, schnelle Test-Alternative, die sich hervorragend in Vite- und Next.js-Projekte integriert. Wir installieren es im Root des Monorepos, um Tests zentral für alle Pakete ausführen zu können. Zusätzlich benötigen wir `@vitejs/plugin-react` um React-Komponenten (JSX) in den Tests korrekt verarbeiten zu können.

## 🛠️ Implementierung

### 1. Test-Abhängigkeiten installieren

Füge die folgenden Entwicklungsabhängigkeiten zur **Root-`package.json`** hinzu.

**Datei:** `package.json` (im Hauptverzeichnis)

**Zu suchendender Block:**
```json
  "devDependencies": {
    "turbo": "^2.0.4"
  }
}
```

**Ersetzen durch:**
```json
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "turbo": "^2.0.4",
    "vitest": "^2.0.1"
  }
}
```

### 2. `vitest`-Konfiguration erstellen

Erstelle eine zentrale Konfigurationsdatei für `vitest` im Hauptverzeichnis des Projekts.

**Datei:** `vitest.config.ts` (im Hauptverzeichnis)

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
});
```

## ✅ Verifizierung

Führe nach den Änderungen die folgenden Befehle im Root-Verzeichnis aus:

1.  **Installation der neuen Abhängigkeiten:**
    ```bash
    npm install
    ```
2.  **Initialer Testlauf:**
    ```bash
    npx vitest
    ```

Der `vitest`-Befehl sollte erfolgreich starten und melden, dass keine Testdateien gefunden wurden ("No test files found"). Dies bestätigt, dass das Framework korrekt installiert und konfiguriert ist und bereit ist für das Hinzufügen der ersten Tests.

