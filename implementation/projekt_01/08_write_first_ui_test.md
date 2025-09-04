# Task 8: Ersten UI-Test schreiben

## 🎯 Ziel

Den ersten Test für eine UI-Komponente erstellen, um die Funktionsfähigkeit der in Schritt 7 eingerichteten `vitest`-Umgebung zu beweisen und ein klares Muster für zukünftige Komponententests zu etablieren.

## 📝 Kontext

Nach der Konfiguration von `vitest` ist der nächste logische Schritt, einen echten Test hinzuzufügen. Wir wählen die `Button`-Komponente aus dem `ui`-Paket, da sie einfach ist und bereits existiert. Dieser Test validiert, dass React-Komponenten im Test-Runner korrekt gerendert werden können (dank `jsdom` und `@vitejs/plugin-react`) und dass die Test-Assertions wie erwartet funktionieren.

## 🛠️ Implementierung

### 1. Test-Abhängigkeiten im `ui`-Paket hinzufügen

Wir benötigen `@testing-library/react`, um unsere Komponenten im Test zu rendern und mit ihnen zu interagieren. Fügen wir es zur `package.json` des `ui`-Pakets hinzu.

**Datei:** `packages/ui/package.json`

**Zu suchendender Block:**
```json
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "eslint-config-next": "^14.0.0",
    "typescript": "^5.3.0"
  }
}
```

**Ersetzen durch:**
```json
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "eslint-config-next": "^14.0.0",
    "typescript": "^5.3.0"
  }
}
```


### 2. `Button`-Testdatei erstellen

Erstelle die folgende Testdatei direkt neben der `Button`-Komponente.

**Datei:** `packages/ui/src/Button.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Button } from "./Button";

test("Button renders with children", () => {
  render(<Button>Click me</Button>);
  const buttonElement = screen.getByText(/Click me/i);
  expect(buttonElement).toBeInTheDocument();
});
```

## ✅ Verifizierung

Führe nach den Änderungen die folgenden Befehle aus:

1. **Abhängigkeiten installieren (im Root-Verzeichnis):**
   ```bash
   npm install
   ```

2. **Tests für das `ui`-Paket ausführen (im Root-Verzeichnis):**
   ```bash
   npx vitest run packages/ui
   ```

Der Befehl sollte nun einen erfolgreichen Testlauf melden (`1 passed`). Dies bestätigt, dass die Testumgebung für React-Komponenten vollständig funktionsfähig ist.

