# Task 6: UI-Komponente in der Web-App integrieren

## 🎯 Ziel

Die erfolgreiche Integration einer Komponente aus einem lokalen Paket (`@starter-kit/ui`) in die Hauptanwendung (`apps/web`) demonstrieren und damit den korrekten Aufbau des Monorepos validieren.

## 📝 Kontext

Nachdem wir in den vorherigen Schritten die einzelnen Pakete lauffähig gemacht haben, ist dies der erste echte Integrationstest. Wir importieren die in Task 2 erstellte `Button`-Komponente und verwenden sie auf der Startseite. Dies stellt sicher, dass die TypeScript-Pfad-Aliase (`@/ui`) korrekt konfiguriert sind und der Next.js-Build-Prozess mit den lokalen Paketen reibungslos funktioniert.

## 🛠️ Implementierung

### 1. `Button`-Komponente importieren und verwenden

Bearbeite die Startseite der Web-Anwendung, um den neuen Button zu importieren und anzuzeigen.

**Datei:** `apps/web/src/app/page.tsx`

**Zu suchendender Block:**
```tsx
import Image from "next/image";

export default function Home() {
```

**Ersetzen durch:**
```tsx
import Image from "next/image";
import { Button } from "@/ui";

export default function Home() {
```

**Zu suchendender Block:**
```tsx
            Read our docs
          </a>
        </div>
      </main>
```

**Ersetzen durch:**
```tsx
            Read our docs
          </a>
        </div>

        <div className="mt-8">
          <Button>Hello from the UI package!</Button>
        </div>
      </main>
```

## ✅ Verifizierung

Führe nach der Änderung den Development-Server aus:

```bash
npm run dev
```

Öffne [http://localhost:3004](http://localhost:3004) im Browser. Unter den bestehenden Links sollte nun ein neuer, gestylter Button mit dem Text "Hello from the UI package!" sichtbar sein. Dies bestätigt, dass die End-to-End-Integration von lokalen Paketen in die Web-App erfolgreich ist.

