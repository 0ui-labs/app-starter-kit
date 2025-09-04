# Task 9: Test-Skript hinzufügen und finale Überprüfung

## 🎯 Ziel

Den Entwickler-Workflow finalisieren, indem ein zentrales `test`-Skript hinzugefügt wird und die konsistente Ausführung aller Qualitäts-Checks (Test, Lint, Build) sichergestellt wird.

## 📝 Kontext

Der letzte Schritt ist die Einrichtung eines einfachen, standardisierten Befehls zum Ausführen aller Tests im Monorepo. Wir fügen ein `test`-Skript zur Root-`package.json` hinzu, das `vitest` aufruft. Außerdem stellen wir sicher, dass alle Pakete ein `lint`-Skript haben, um Konsistenz zu gewährleisten. Dies rundet das Setup ab und sorgt für eine saubere, zuverlässige CI/CD-Pipeline.

## 🛠️ Implementierung

### 1. `test`-Skript zur Root-`package.json` hinzufügen

**Datei:** `package.json` (im Hauptverzeichnis)

**Zu suchendender Block:**
```json
  "scripts": {
    "dev": "turbo run dev",
    "setup": "if [ ! -f .env ]; then cp .env.example .env && echo 'Created .env file. Please fill in your API keys.'; fi && npx prisma migrate dev --name init"
  },
```

**Ersetzen durch:**
```json
  "scripts": {
    "dev": "turbo run dev",
    "setup": "if [ ! -f .env ]; then cp .env.example .env && echo 'Created .env file. Please fill in your API keys.'; fi && npx prisma migrate dev --name init",
    "test": "vitest run",
    "lint": "turbo run lint",
    "build": "turbo run build"
  },
```

## ✅ Verifizierung

Führe die folgenden Befehle im Root-Verzeichnis aus. Alle drei müssen erfolgreich und ohne Fehler durchlaufen.

1.  **Tests ausführen:**
    ```bash
    npm test
    ```
    *Erwartetes Ergebnis:* Vitest läuft und meldet `1 passed` für den Button-Test.

2.  **Linter ausführen:**
    ```bash
    npm run lint
    ```
    *Erwartetes Ergebnis:* Turborepo führt ESLint für alle Pakete aus, ohne Fehler zu melden.

3.  **Projekt bauen:**
    ```bash
    npm run build
    ```
    *Erwartetes Ergebnis:* Turborepo baut alle Pakete erfolgreich.

Wenn alle drei Befehle erfolgreich sind, ist das Projekt vollständig stabilisiert, testbar und bereit für die Weiterentwicklung.

