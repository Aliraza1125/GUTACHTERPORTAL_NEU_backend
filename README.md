# Gutachterportal Backend

Dies ist das Backend für das Gutachterportal, eine Anwendung zur Verwaltung von Gutachten und Fällen.

## Technologien

- Node.js
- Express.js
- MongoDB mit Mongoose
- JWT für Authentifizierung
- Multer für Datei-Uploads
- Nodemailer für E-Mail-Versand

## Installation

1. Abhängigkeiten installieren:
```
npm install
```

2. Umgebungsvariablen konfigurieren:
Erstellen Sie eine `.env`-Datei im Backend-Verzeichnis mit folgenden Variablen:
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/gutachterportal
JWT_SECRET=ihr_geheimer_schluessel
NODE_ENV=development

# E-Mail-Konfiguration für Double-Opt-In
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=user@example.com
EMAIL_PASS=password
EMAIL_FROM=Gutachterportal <noreply@gutachterportal.de>
FRONTEND_URL=http://localhost:5173
```

## Entwicklung

Starten Sie den Entwicklungsserver:
```
npm run dev
```

## Produktion

Starten Sie den Produktionsserver:
```
npm start
```

## API-Endpunkte

### Benutzer
- `POST /api/users/register` - Benutzer registrieren
- `POST /api/users/login` - Benutzer anmelden
- `GET /api/users/aktivieren/:token` - Benutzerkonto aktivieren (Double-Opt-In)
- `GET /api/users/profile` - Benutzerprofil abrufen
- `PUT /api/users/profile` - Benutzerprofil aktualisieren
- `GET /api/users` - Alle Benutzer abrufen (nur Admin)

### Fälle
- `POST /api/cases` - Neuen Fall erstellen
- `GET /api/cases` - Alle Fälle abrufen
- `GET /api/cases/:id` - Fall nach ID abrufen
- `PUT /api/cases/:id` - Fall aktualisieren
- `DELETE /api/cases/:id` - Fall löschen
- `POST /api/cases/:id/notes` - Notiz zu einem Fall hinzufügen

### Dokumente
- `POST /api/documents` - Dokument hochladen
- `GET /api/documents/case/:caseId` - Dokumente eines Falls abrufen
- `GET /api/documents/:id` - Dokument nach ID abrufen
- `GET /api/documents/:id/download` - Dokument herunterladen
- `DELETE /api/documents/:id` - Dokument löschen

## Datenbankmodelle

### User
- vorname
- nachname
- email
- passwort (gehasht)
- rolle (gutachter, admin)
- gutachterNummer (eindeutige Nummer, beginnend ab 25001)
- fachgebiet
- telefon
- geburtsdatum
- firma
- regionen (Array von Tätigkeitsregionen)
- taetigkeitsbereiche
- webseite
- qualifikationen
- adresse
- profilbild
- benachrichtigungsEinstellungen
- aktivierungsToken
- aktiviert
- erstelltAm
- letzterLogin

### Case
- fallnummer
- titel
- beschreibung
- kategorie
- status
- prioritaet
- erstelltVon
- zugewiesenAn
- dokumente
- auftraggeber
- frist
- notizen
- erstelltAm
- letzteAktualisierung

### Document
- name
- beschreibung
- dateityp
- groesse
- pfad
- fall
- hochgeladenVon
- kategorie
- tags
- hochgeladenAm 