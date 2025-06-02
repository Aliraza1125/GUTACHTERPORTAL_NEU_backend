const Case = require('../models/Case');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Document = require('../models/Document');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const Minio = require('minio');

// MinIO Konfiguration (wie in documentController.js)
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT?.replace(/^https?:\/\//, '') || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD
});
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'gutachten';

// @desc    Neuen Fall erstellen
// @route   POST /api/cases
// @access  Private
exports.createCase = async (req, res) => {
  try {
    const {
      fallname,
      aktenzeichen,
      status,
      datum,
      mandant,
      erstPartei,
      zweitPartei,
      schaden
    } = req.body;

    // Gutachternummer des Users holen
    const user = await require('../models/User').findById(req.user.id);
    const gutachterNummer = user.gutachterNummer;
    // Nächste Fallnummer für diesen Gutachter bestimmen (robust gegen Duplikate)
    const lastCase = await Case.findOne({ gutachterNummer }).sort({ fallNummer: -1 });
    const fallNummer = lastCase ? lastCase.fallNummer + 1 : 1;

    // Aktenzeichen generieren, falls nicht mitgesendet
    let aktenzeichenFinal = aktenzeichen;
    if (!aktenzeichenFinal) {
      aktenzeichenFinal = `GUT-${gutachterNummer}-${fallNummer.toString().padStart(2, '0')}`;
    }

    // Mandantennummer generieren im Format MD-XXXXXX
    const mandantennummer = `MD-${(100 + fallNummer).toString().padStart(6, '0')}`;

    // Bestehende Mandantendaten übernehmen oder neue erstellen
    const mandantData = mandant || {};
    mandantData.mandantennummer = mandantennummer;

    const newCase = await Case.create({
      fallname,
      aktenzeichen: aktenzeichenFinal,
      status,
      datum,
      mandant: mandantData,
      erstPartei,
      zweitPartei,
      schaden,
      erstelltVon: req.user.id,
      zugewiesenAn: req.user.id, // Standardmäßig dem Ersteller zuweisen
      gutachterNummer,
      fallNummer
    });

    res.status(201).json({
      erfolg: true,
      nachricht: 'Fall erfolgreich erstellt',
      fall: newCase
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des Falls:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Erstellen des Falls',
      fehler: error.message
    });
  }
};

// @desc    Alle Fälle abrufen
// @route   GET /api/cases
// @access  Private
exports.getCases = async (req, res) => {
  try {
    // Filter basierend auf Query-Parametern
    const filter = {};
    
    if (req.query.status) filter.status = req.query.status;
    if (req.query.kategorie) filter.kategorie = req.query.kategorie;
    if (req.query.prioritaet) filter.prioritaet = req.query.prioritaet;
    
    // Wenn nicht Admin, nur eigene Fälle anzeigen
    if (req.user.rolle !== 'admin') {
      filter.$or = [
        { erstelltVon: req.user.id },
        { zugewiesenAn: req.user.id }
      ];
    }

    // Sortierung und Paginierung
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cases = await Case.find(filter)
      .populate('erstelltVon', 'vorname nachname email')
      .populate('zugewiesenAn', 'vorname nachname')
      .populate('dokumente')
      .sort({ letzteAktualisierung: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Case.countDocuments(filter);

    res.json({
      erfolg: true,
      seite: page,
      seiten: Math.ceil(total / limit),
      gesamt: total,
      faelle: cases
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Fälle:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Abrufen der Fälle',
      fehler: error.message
    });
  }
};

// @desc    Fall nach ID abrufen
// @route   GET /api/cases/:id
// @access  Private
exports.getCaseById = async (req, res) => {
  try {
    const fall = await Case.findById(req.params.id)
      .populate('erstelltVon', 'vorname nachname email')
      .populate('zugewiesenAn', 'vorname nachname email')
      .populate('dokumente')
      .populate('notizen.erstelltVon', 'vorname nachname');

    if (!fall) {
      return res.status(404).json({
        erfolg: false,
        nachricht: 'Fall nicht gefunden'
      });
    }

    // Zugriffsberechtigung prüfen (nur Admin oder zugewiesener Benutzer)
    if (
      req.user.rolle !== 'admin' && 
      fall.erstelltVon._id.toString() !== req.user.id && 
      (!fall.zugewiesenAn || fall.zugewiesenAn._id.toString() !== req.user.id)
    ) {
      return res.status(403).json({
        erfolg: false,
        nachricht: 'Keine Berechtigung für diesen Fall'
      });
    }

    res.json({
      erfolg: true,
      fall
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Falls:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Abrufen des Falls',
      fehler: error.message
    });
  }
};

// @desc    Fall aktualisieren
// @route   PUT /api/cases/:id
// @access  Private
exports.updateCase = async (req, res) => {
  try {
    const fall = await Case.findById(req.params.id);

    if (!fall) {
      return res.status(404).json({
        erfolg: false,
        nachricht: 'Fall nicht gefunden'
      });
    }

    // Zugriffsberechtigung prüfen
    if (
      req.user.rolle !== 'admin' && 
      fall.erstelltVon.toString() !== req.user.id && 
      (!fall.zugewiesenAn || fall.zugewiesenAn.toString() !== req.user.id)
    ) {
      return res.status(403).json({
        erfolg: false,
        nachricht: 'Keine Berechtigung zum Aktualisieren dieses Falls'
      });
    }

    // Aktualisiere nur die bereitgestellten Felder
    const updateData = req.body;
    updateData.letzteAktualisierung = Date.now();
    // Schutz: Dokumente dürfen nicht per Update überschrieben werden
    if (updateData.dokumente !== undefined) {
      delete updateData.dokumente;
    }

    const updatedCase = await Case.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
    .populate('erstelltVon', 'vorname nachname email')
    .populate('zugewiesenAn', 'vorname nachname email')
    .populate('dokumente');

    res.json({
      erfolg: true,
      nachricht: 'Fall erfolgreich aktualisiert',
      fall: updatedCase
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Falls:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Aktualisieren des Falls',
      fehler: error.message
    });
  }
};

// @desc    Notiz zu einem Fall hinzufügen
// @route   POST /api/cases/:id/notes
// @access  Private
exports.addCaseNote = async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        erfolg: false,
        nachricht: 'Notiztext ist erforderlich'
      });
    }

    const fall = await Case.findById(req.params.id);

    if (!fall) {
      return res.status(404).json({
        erfolg: false,
        nachricht: 'Fall nicht gefunden'
      });
    }

    // Neue Notiz hinzufügen
    const newNote = {
      text,
      erstelltVon: req.user.id,
      erstelltAm: Date.now()
    };

    fall.notizen.push(newNote);
    fall.letzteAktualisierung = Date.now();
    
    await fall.save();

    // Aktualisierte Fall mit populierten Daten zurückgeben
    const updatedCase = await Case.findById(req.params.id)
      .populate('erstelltVon', 'vorname nachname email')
      .populate('zugewiesenAn', 'vorname nachname email')
      .populate('notizen.erstelltVon', 'vorname nachname');

    res.status(201).json({
      erfolg: true,
      nachricht: 'Notiz erfolgreich hinzugefügt',
      fall: updatedCase
    });
  } catch (error) {
    console.error('Fehler beim Hinzufügen der Notiz:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Hinzufügen der Notiz',
      fehler: error.message
    });
  }
};

// @desc    Fall löschen
// @route   DELETE /api/cases/:id
// @access  Private/Admin
exports.deleteCase = async (req, res) => {
  try {
    const fall = await Case.findById(req.params.id);

    if (!fall) {
      return res.status(404).json({
        erfolg: false,
        nachricht: 'Fall nicht gefunden'
      });
    }

    // Nur Admins oder der Ersteller dürfen löschen
    if (req.user.rolle !== 'admin' && fall.erstelltVon.toString() !== req.user.id) {
      return res.status(403).json({
        erfolg: false,
        nachricht: 'Keine Berechtigung zum Löschen dieses Falls'
      });
    }

    await fall.deleteOne();

    res.json({
      erfolg: true,
      nachricht: 'Fall erfolgreich gelöscht'
    });
  } catch (error) {
    console.error('Fehler beim Löschen des Falls:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Löschen des Falls',
      fehler: error.message
    });
  }
};

// @desc    Datenschutzerklärung-Status aktualisieren
// @route   PATCH /api/cases/:id/datenschutz
// @access  Private
exports.patchDatenschutz = async (req, res) => {
  try {
    const { datenschutzAngenommen } = req.body;
    const fall = await Case.findById(req.params.id);
    if (!fall) {
      return res.status(404).json({ erfolg: false, nachricht: 'Fall nicht gefunden' });
    }
    // Zugriffsberechtigung prüfen
    if (
      req.user.rolle !== 'admin' &&
      fall.erstelltVon.toString() !== req.user.id &&
      (!fall.zugewiesenAn || fall.zugewiesenAn.toString() !== req.user.id)
    ) {
      return res.status(403).json({ erfolg: false, nachricht: 'Keine Berechtigung zum Aktualisieren dieses Falls' });
    }
    fall.datenschutzAngenommen = !!datenschutzAngenommen;
    fall.letzteAktualisierung = Date.now();
    await fall.save();
    res.json({ erfolg: true, nachricht: 'Datenschutzstatus aktualisiert', fall });
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Datenschutzstatus:', error);
    res.status(500).json({ erfolg: false, nachricht: 'Serverfehler beim Aktualisieren des Datenschutzstatus', fehler: error.message });
  }
};

// @desc    Fall per Mail an Rechtly und Gutachter senden
// @route   POST /api/cases/send
// @access  Private
exports.sendCase = async (req, res) => {
  try {
    const { fallId } = req.body;
    if (!fallId) return res.status(400).json({ erfolg: false, nachricht: 'Fall-ID fehlt.' });
    // Fall und zugehörige Daten laden
    const fall = await Case.findById(fallId)
      .populate('erstelltVon', 'vorname nachname email gutachterNummer')
      .populate('mandant')
      .populate('erstPartei')
      .populate('zweitPartei');
    if (!fall) return res.status(404).json({ erfolg: false, nachricht: 'Fall nicht gefunden.' });
    // Dokumente laden
    const dokumente = await Document.find({ fall: fallId });
    // PDF generieren
    const logoPath = path.join(__dirname, '../../assets/Logo Kopie.png');
    const pdfBuffer = await generateCasePdf(fall, dokumente, logoPath);
    // HTML-Mail generieren
    const html = generateCaseHtml(fall, dokumente);
    // Dokumenten-Anhänge laden (maximal 10 Dokumente)
    const MAX_DOC_ATTACHMENTS = 20;
    const docAttachments = [];
    let docCount = 0;
    for (const docu of dokumente) {
      if (docu.pfad && docCount < MAX_DOC_ATTACHMENTS) {
        try {
          let fileBuffer = null;
          let filename = docu.name || docu.originalname || docu.typ || docu._id;
          if (docu.pfad.startsWith('http')) {
            const response = await fetch(docu.pfad);
            if (response.ok) {
              fileBuffer = Buffer.from(await response.arrayBuffer());
            }
          } else if (docu.pfad.startsWith('GUTACHTER/')) {
            // MinIO-Objektpfad
            fileBuffer = await new Promise((resolve, reject) => {
              const chunks = [];
              minioClient.getObject(MINIO_BUCKET, docu.pfad, (err, dataStream) => {
                if (err) return reject(err);
                dataStream.on('data', chunk => chunks.push(chunk));
                dataStream.on('end', () => resolve(Buffer.concat(chunks)));
                dataStream.on('error', reject);
              });
            });
          } else {
            fileBuffer = fs.readFileSync(docu.pfad);
          }
          if (fileBuffer) {
            docAttachments.push({ filename, content: fileBuffer });
            docCount++;
          }
        } catch (err) {
          console.warn('Dokument konnte nicht geladen werden:', docu.pfad, err.message);
        }
      }
    }
    if (dokumente.length > MAX_DOC_ATTACHMENTS) {
      console.warn('Zu viele Dokumente, es werden nur die ersten 10 als Anhang versendet.');
    }
    // Logo als eingebettetes Attachment
    const logoAttachment = {
      filename: 'Logo Kopie.png',
      path: logoPath,
      cid: 'logo'
    };
    // Attachments zusammenstellen
    const attachments = [
      { filename: 'Falluebersicht.pdf', content: pdfBuffer },
      ...docAttachments,
      logoAttachment
    ];
    // Übermittlungszähler erhöhen und Status setzen
    let kopieNummer = fall.uebermittlungen || 0;
    fall.uebermittlungen = (fall.uebermittlungen || 0) + 1;
    fall.status = 'Übermittelt';
    await fall.save();
    // Betreff ggf. mit Kopie
    let betreffSuffix = '';
    if (fall.uebermittlungen > 1) {
      betreffSuffix = ` - Kopie ${fall.uebermittlungen - 1}`;
    }
    // Mail an Rechtly
    try {
      await sendMail({
        to: 'anfragen@rechtly.de',
        subject: `Neuer Fall von ${fall.erstelltVon?.vorname || ''} ${fall.erstelltVon?.nachname || ''}${betreffSuffix}`,
        html,
        attachments
      });
    } catch (mailErr) {
      console.error('Fehler beim Senden der Mail an Rechtly:', mailErr);
      return res.status(500).json({ erfolg: false, nachricht: 'Fehler beim Senden der E-Mail an Rechtly.', fehler: mailErr.message });
    }
    // Bestätigung an Gutachter
    if (fall.erstelltVon?.email) {
      try {
        await sendMail({
          to: fall.erstelltVon.email,
          subject: `Bestätigung: Ihr Fall wurde an Rechtly gesendet${betreffSuffix}`,
          html,
          attachments: [
            { filename: 'Falluebersicht.pdf', content: pdfBuffer },
            ...docAttachments,
            logoAttachment
          ]
        });
      } catch (mailErr) {
        console.error('Fehler beim Senden der Mail an den Gutachter:', mailErr);
        return res.status(500).json({ erfolg: false, nachricht: 'Fehler beim Senden der E-Mail an den Gutachter.', fehler: mailErr.message });
      }
    }
    res.json({ erfolg: true, nachricht: 'Fall wurde gesendet.', fall: { status: fall.status, uebermittlungen: fall.uebermittlungen } });
  } catch (error) {
    console.error('Fehler beim Senden des Falls:', error);
    res.status(500).json({ erfolg: false, nachricht: 'Serverfehler beim Senden des Falls', fehler: error.message });
  }
};

// Hilfsfunktion: PDF-Übersicht generieren
async function generateCasePdf(fall, dokumente, logoPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      // Logo im Header
      if (logoPath) {
        try { doc.image(logoPath, { width: 120, align: 'center' }); } catch {}
      }
      doc.moveDown();
      doc.fontSize(18).text('Fallübersicht', { align: 'center' });
      doc.moveDown();
      // Gutachterdaten
      doc.fontSize(12).text('Gutachter:', { underline: true });
      doc.text(`${fall.erstelltVon?.vorname || ''} ${fall.erstelltVon?.nachname || ''}`);
      doc.text(`E-Mail: ${fall.erstelltVon?.email || ''}`);
      doc.text(`Gutachternummer: ${fall.gutachterNummer || ''}`);
      doc.moveDown();
      // Fallinformationen
      doc.text('Fallinformationen:', { underline: true });
      doc.text(`Aktenzeichen: ${fall.aktenzeichen}`);
      doc.text(`Fall-ID: ${fall._id}`);
      doc.text(`Erstellt am: ${fall.datum ? new Date(fall.datum).toLocaleDateString('de-DE') : ''}`);
      doc.text(`Zuletzt geändert: ${fall.letzteAktualisierung ? new Date(fall.letzteAktualisierung).toLocaleDateString('de-DE') : ''}`);
      doc.moveDown();
      // Mandantendaten
      doc.text('Mandant:', { underline: true });
      if (fall.mandant) {
        Object.entries(fall.mandant).forEach(([k, v]) => doc.text(`${k}: ${v}`));
      }
      doc.moveDown();
      // Schadeninformationen
      doc.text('Schaden:', { underline: true });
      if (fall.schaden) {
        Object.entries(fall.schaden).forEach(([k, v]) => doc.text(`${k}: ${v}`));
      }
      doc.moveDown();
      // Parteien
      doc.text('Erste Partei:', { underline: true });
      if (fall.erstPartei) {
        Object.entries(fall.erstPartei).forEach(([k, v]) => doc.text(`${k}: ${v}`));
      }
      doc.moveDown();
      doc.text('Zweite Partei:', { underline: true });
      if (fall.zweitPartei) {
        Object.entries(fall.zweitPartei).forEach(([k, v]) => doc.text(`${k}: ${v}`));
      }
      doc.moveDown();
      // Datenschutz
      doc.text('Datenschutz angenommen?', { underline: true });
      doc.text(fall.datenschutzAngenommen ? 'Ja' : 'Nein');
      doc.moveDown();
      // Dokumente
      doc.text('Hochgeladene Dokumente:', { underline: true });
      if (dokumente && dokumente.length > 0) {
        dokumente.forEach(docu => doc.text(`- ${docu.name || docu.originalname || docu.typ || docu._id}`));
      } else {
        doc.text('Keine Dokumente vorhanden.');
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Hilfsfunktion: HTML-Mail generieren
function generateCaseHtml(fall, dokumente) {
  return `
    <div style="font-family: Arial, sans-serif;">
      <div style="text-align:center; margin-bottom:24px;">
        <img src="cid:logo" alt="Logo" style="width:160px; margin-bottom:8px;" />
        <h2 style="color:#1a237e;">Fallübersicht</h2>
      </div>
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr><th colspan="2" style="background:#f5f5f5; text-align:left; padding:8px;">Gutachterdaten</th></tr>
        <tr><td>Gutachter</td><td>${fall.erstelltVon?.vorname || ''} ${fall.erstelltVon?.nachname || ''}</td></tr>
        <tr><td>E-Mail</td><td>${fall.erstelltVon?.email || ''}</td></tr>
        <tr><td>Gutachternummer</td><td>${fall.gutachterNummer || ''}</td></tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr><th colspan="2" style="background:#f5f5f5; text-align:left; padding:8px;">Fallinformationen</th></tr>
        <tr><td>Aktenzeichen</td><td>${fall.aktenzeichen}</td></tr>
        <tr><td>Fall-ID</td><td>${fall._id}</td></tr>
        <tr><td>Erstellt am</td><td>${fall.datum ? new Date(fall.datum).toLocaleDateString('de-DE') : ''}</td></tr>
        <tr><td>Zuletzt geändert</td><td>${fall.letzteAktualisierung ? new Date(fall.letzteAktualisierung).toLocaleDateString('de-DE') : ''}</td></tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr><th colspan="2" style="background:#f5f5f5; text-align:left; padding:8px;">Mandantendaten</th></tr>
        ${(fall.mandant ? Object.entries(fall.mandant).map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') : '<tr><td colspan="2">Keine Daten</td></tr>')}
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr><th colspan="2" style="background:#f5f5f5; text-align:left; padding:8px;">Schadeninformationen</th></tr>
        ${(fall.schaden ? Object.entries(fall.schaden).map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') : '<tr><td colspan="2">Keine Daten</td></tr>')}
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr><th colspan="2" style="background:#f5f5f5; text-align:left; padding:8px;">Erste Partei</th></tr>
        ${(fall.erstPartei ? Object.entries(fall.erstPartei).map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') : '<tr><td colspan="2">Keine Daten</td></tr>')}
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr><th colspan="2" style="background:#f5f5f5; text-align:left; padding:8px;">Zweite Partei</th></tr>
        ${(fall.zweitPartei ? Object.entries(fall.zweitPartei).map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') : '<tr><td colspan="2">Keine Daten</td></tr>')}
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr><th style="background:#f5f5f5; text-align:left; padding:8px;">Datenschutz angenommen?</th><td>${fall.datenschutzAngenommen ? 'Ja' : 'Nein'}</td></tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr><th colspan="2" style="background:#f5f5f5; text-align:left; padding:8px;">Hochgeladene Dokumente</th></tr>
        ${(dokumente && dokumente.length > 0) ? dokumente.map(docu => `<tr><td colspan="2">${docu.name || docu.originalname || docu.typ || docu._id}</td></tr>`).join('') : '<tr><td colspan="2">Keine Dokumente vorhanden.</td></tr>'}
      </table>
    </div>
  `;
}

// Hilfsfunktion für Mailversand (Platzhalter, nutzt nodemailer)
async function sendMail({ to, subject, html, attachments }) {
  // Transporter muss ggf. aus zentraler Config kommen
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.example.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || 'user@example.com',
      pass: process.env.EMAIL_PASS || 'password'
    }
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'Gutachterportal <noreply@gutachterportal.de>',
    to,
    subject,
    html,
    attachments
  });
} 