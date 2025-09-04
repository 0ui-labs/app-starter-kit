
# Implementierungsplan: Vom kaputten zum robusten Starter-Kit

## Phase 1: Fundament stabilisieren

- [x] **1. `db`-Paket initialisieren:** Ein `User`-Modell hinzufügen und den Prisma-Client exportieren. ✅ (2025-09-04)
- [ ] **2. `ui`-Paket mit einer Komponente füllen:** Eine `Button.tsx` erstellen und exportieren.
- [ ] **3. `api`-Paket zum Leben erwecken:** Eine `healthCheck`-Prozedur definieren.
- [ ] **4. Restliche Pakete stubben:** Leere `index.ts`-Dateien in `auth`, `ai-adapter`, und `agentic-workflows` erstellen.

## Phase 2: Architekturfehler beheben

- [ ] **5. Abhängigkeitsfehler in `apps/web` korrigieren:** `@prisma/client` entfernen.
- [ ] **6. UI-Komponente in der Web-App integrieren:** Den `Button` auf der Startseite verwenden.

## Phase 3: Testinfrastruktur aufbauen

- [ ] **7. Test-Framework installieren und konfigurieren:** `vitest` und `jsdom` hinzufügen.
- [ ] **8. Ersten UI-Test schreiben:** Die `Button`-Komponente testen.
- [ ] **9. Test-Skript hinzufügen und finale Überprüfung:** `npm test` einrichten und alle Checks ausführen.

