const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Minio = require('minio');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const crypto = require('crypto');

// Helper-Funktion zum Erstellen eines JWT-Tokens
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
    expiresIn: '30d'
  });
};

// E-Mail-Transporter konfigurieren
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.example.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || 'user@example.com',
    pass: process.env.EMAIL_PASS || 'password'
  },
  connectionTimeout: 20000, // 20 Sekunden
  greetingTimeout: 10000,
  socketTimeout: 20000
});

// Aktivierungs-E-Mail senden
const sendActivationEmail = async (user) => {
  const activationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/aktivieren/${user.aktivierungsToken}`;
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Gutachterportal <noreply@gutachterportal.de>',
    to: user.email,
    subject: 'Aktivieren Sie Ihr Konto bei Rechtly Gutachterportal',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976d2;">Willkommen bei Rechtly Gutachterportal!</h2>
        <p>Sehr geehrte(r) ${user.vorname} ${user.nachname},</p>
        <p>vielen Dank für Ihre Registrierung. Um Ihr Konto zu aktivieren und alle Funktionen des Gutachterportals nutzen zu können, klicken Sie bitte auf den folgenden Link:</p>
        <p style="margin: 20px 0;">
          <a href="${activationUrl}" style="background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Konto aktivieren</a>
        </p>
        <p>Oder kopieren Sie diesen Link in Ihren Browser:</p>
        <p>${activationUrl}</p>
        <p>Der Link ist 24 Stunden gültig.</p>
        <p>Ihre Gutachternummer lautet: <strong>${user.gutachterNummer}</strong></p>
        <p>Bitte notieren Sie sich diese Nummer für zukünftige Referenzen.</p>
        <p>Mit freundlichen Grüßen,<br>Ihr Rechtly Gutachterportal-Team</p>
      </div>
    `
  };
  try {
    await transporter.sendMail(mailOptions);
    console.log('Aktivierungs-E-Mail erfolgreich gesendet an:', user.email);
    return { success: true };
  } catch (error) {
    console.error('Fehler beim Senden der Aktivierungs-E-Mail:', error);
    return { success: false, error: error.message };
  }
};

// Funktion zum Generieren der nächsten Gutachternummer
const generateNextGutachterNummer = async () => {
  try {
    // Finde den Benutzer mit der höchsten Gutachternummer
    const lastUser = await User.findOne({})
      .sort({ gutachterNummer: -1 })
      .limit(1);
    
    // Wenn kein Benutzer gefunden wurde oder keine Gutachternummer existiert, starte bei 25001
    const nextNumber = lastUser && lastUser.gutachterNummer ? lastUser.gutachterNummer + 1 : 25001;
    
    return nextNumber;
  } catch (error) {
    console.error('Fehler beim Generieren der Gutachternummer:', error);
    return 25001; // Fallback auf Startnummer
  }
};

// MinIO-Client initialisieren (wie in server.js)
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT?.replace(/^https?:\/\//, '') || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD
});
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'gutachten';

// @desc    Benutzer registrieren
// @route   POST /api/users/register
// @access  Public
exports.registerUser = async (req, res) => {
  let user = null;
  try {
    const { 
      vorname, 
      nachname, 
      email, 
      passwort, 
      fachgebiet,
      telefon,
      geburtsdatum,
      firma,
      regionen,
      taetigkeitsbereiche,
      webseite,
      aktivierungsToken
    } = req.body;

    // Prüfen, ob Benutzer bereits existiert
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ 
        erfolg: false, 
        nachricht: 'Diese E-Mail-Adresse wird bereits verwendet' 
      });
    }

    // Nächste Gutachternummer generieren
    const gutachterNummer = await generateNextGutachterNummer();

    // Neuen Benutzer erstellen (aber noch nicht speichern)
    user = new User({
      vorname,
      nachname,
      email,
      passwort,
      fachgebiet,
      telefon,
      geburtsdatum,
      firma,
      regionen,
      taetigkeitsbereiche,
      webseite,
      aktivierungsToken,
      aktiviert: false,
      gutachterNummer
    });

    await user.save();

    // Aktivierungs-E-Mail senden
    const emailResult = await sendActivationEmail(user);

    if (!emailResult.success) {
      // User wieder löschen, wenn E-Mail nicht gesendet werden konnte
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        erfolg: false,
        nachricht: 'Registrierung fehlgeschlagen. Aktivierungs-E-Mail konnte nicht gesendet werden.',
        fehler: emailResult.error
      });
    }

    res.status(201).json({
      erfolg: true,
      nachricht: 'Registrierung erfolgreich. Bitte überprüfen Sie Ihre E-Mail, um Ihr Konto zu aktivieren.'
    });
  } catch (error) {
    // User ggf. wieder löschen, falls Fehler nach dem Speichern auftritt
    if (user && user._id) await User.findByIdAndDelete(user._id);
    console.error('Registrierungsfehler:', error);
    res.status(500).json({ 
      erfolg: false, 
      nachricht: 'Serverfehler bei der Registrierung', 
      fehler: error.message 
    });
  }
};

// @desc    Konto aktivieren
// @route   GET /api/users/aktivieren/:token
// @access  Public
exports.activateAccount = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Benutzer mit dem Aktivierungstoken finden
    const user = await User.findOne({ aktivierungsToken: token });
    
    if (!user) {
      // Prüfen, ob der Token schon entfernt wurde, aber die E-Mail existiert
      // Suche nach einem User, der bereits aktiviert ist und keinen Token mehr hat
      const alreadyActivated = await User.findOne({ aktiviert: true });
      if (alreadyActivated) {
        return res.status(200).json({
          erfolg: true,
          nachricht: 'Ihr Konto ist bereits aktiviert. Sie können sich jetzt anmelden.'
        });
      }
      return res.status(400).json({
        erfolg: false,
        nachricht: 'Ungültiger Aktivierungslink'
      });
    }
    
    // Konto aktivieren
    user.aktiviert = true;
    user.aktivierungsToken = undefined; // Token entfernen
    await user.save();
    
    res.json({
      erfolg: true,
      nachricht: 'Ihr Konto wurde erfolgreich aktiviert. Sie können sich jetzt anmelden.',
      benutzer: {
        _id: user._id,
        vorname: user.vorname,
        nachname: user.nachname,
        email: user.email,
        gutachterNummer: user.gutachterNummer,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    console.error('Fehler bei der Kontoaktivierung:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler bei der Kontoaktivierung',
      fehler: error.message
    });
  }
};

// @desc    Benutzer anmelden
// @route   POST /api/users/login
// @access  Public
exports.loginUser = async (req, res) => {
  try {
    const { email, passwort } = req.body;

    // Benutzer mit Passwort finden
    const user = await User.findOne({ email }).select('+passwort');

    if (!user) {
      return res.status(401).json({ 
        erfolg: false, 
        nachricht: 'Ungültige E-Mail oder Passwort' 
      });
    }
    
    // Prüfen, ob das Konto aktiviert ist
    if (!user.aktiviert) {
      return res.status(401).json({
        erfolg: false,
        nachricht: 'Bitte aktivieren Sie zuerst Ihr Konto. Überprüfen Sie Ihre E-Mail.'
      });
    }

    // Passwort überprüfen
    const isMatch = await user.vergleichePasswort(passwort);

    if (!isMatch) {
      return res.status(401).json({ 
        erfolg: false, 
        nachricht: 'Ungültige E-Mail oder Passwort' 
      });
    }

    // Letzten Login aktualisieren
    user.letzterLogin = Date.now();

    // Gerät hinzufügen
    const userAgent = req.headers['user-agent'] || 'Unbekanntes Gerät';
    user.geraete = user.geraete || [];
    user.geraete.push({ name: userAgent, timestamp: new Date() });
    if (user.geraete.length > 10) user.geraete = user.geraete.slice(-10);

    await user.save();

    res.json({
      erfolg: true,
      nachricht: 'Login erfolgreich',
      benutzer: {
        _id: user._id,
        vorname: user.vorname,
        nachname: user.nachname,
        email: user.email,
        telefon: user.telefon,
        geburtsdatum: user.geburtsdatum,
        fachgebiet: user.fachgebiet,
        gutachterNummer: user.gutachterNummer,
        qualifikationen: user.qualifikationen,
        adresse: user.adresse,
        firma: user.firma,
        regionen: user.regionen,
        taetigkeitsbereiche: user.taetigkeitsbereiche,
        webseite: user.webseite,
        profilbild: user.profilbild,
        benachrichtigungsEinstellungen: user.benachrichtigungsEinstellungen,
        rolle: user.rolle,
        erstelltAm: user.erstelltAm,
        letzterLogin: user.letzterLogin,
        geraete: user.geraete,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    console.error('Anmeldefehler:', error);
    res.status(500).json({ 
      erfolg: false, 
      nachricht: 'Serverfehler bei der Anmeldung', 
      fehler: error.message 
    });
  }
};

// @desc    Benutzerprofil abrufen
// @route   GET /api/users/profile
// @access  Private
exports.getUserProfile = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.set('ETag', Date.now().toString());
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ 
        erfolg: false, 
        nachricht: 'Benutzer nicht gefunden' 
      });
    }

    res.json({
      erfolg: true,
      benutzer: {
        _id: user._id,
        vorname: user.vorname,
        nachname: user.nachname,
        email: user.email,
        telefon: user.telefon,
        geburtsdatum: user.geburtsdatum,
        fachgebiet: user.fachgebiet,
        gutachterNummer: user.gutachterNummer,
        qualifikationen: user.qualifikationen,
        adresse: user.adresse,
        firma: user.firma,
        regionen: user.regionen,
        taetigkeitsbereiche: user.taetigkeitsbereiche,
        webseite: user.webseite,
        profilbild: user.profilbild,
        benachrichtigungsEinstellungen: user.benachrichtigungsEinstellungen,
        rolle: user.rolle,
        erstelltAm: user.erstelltAm,
        letzterLogin: user.letzterLogin,
        aktiviert: user.aktiviert
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Profils:', error);
    res.status(500).json({ 
      erfolg: false, 
      nachricht: 'Serverfehler beim Abrufen des Profils', 
      fehler: error.message 
    });
  }
};

// @desc    Benutzerprofil aktualisieren
// @route   PUT /api/users/profile
// @access  Private
exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ 
        erfolg: false, 
        nachricht: 'Benutzer nicht gefunden' 
      });
    }

    // Aktualisiere nur die bereitgestellten Felder
    if (req.body.vorname) user.vorname = req.body.vorname;
    if (req.body.nachname) user.nachname = req.body.nachname;
    if (req.body.email) user.email = req.body.email;
    if (req.body.passwort) user.passwort = req.body.passwort;
    if (req.body.telefon) user.telefon = req.body.telefon;
    if (req.body.geburtsdatum) user.geburtsdatum = req.body.geburtsdatum;
    if (req.body.fachgebiet) user.fachgebiet = req.body.fachgebiet;
    if (req.body.qualifikationen) user.qualifikationen = req.body.qualifikationen;
    if (req.body.adresse) user.adresse = req.body.adresse;
    if (req.body.firma) user.firma = req.body.firma;
    if (req.body.regionen) user.regionen = req.body.regionen;
    if (req.body.taetigkeitsbereiche) user.taetigkeitsbereiche = req.body.taetigkeitsbereiche;
    if (req.body.webseite) user.webseite = req.body.webseite;
    if (req.body.profilbild) user.profilbild = req.body.profilbild;
    if (req.body.benachrichtigungsEinstellungen) user.benachrichtigungsEinstellungen = req.body.benachrichtigungsEinstellungen;

    const updatedUser = await user.save();

    res.json({
      erfolg: true,
      nachricht: 'Profil erfolgreich aktualisiert',
      benutzer: {
        _id: updatedUser._id,
        vorname: updatedUser.vorname,
        nachname: updatedUser.nachname,
        email: updatedUser.email,
        telefon: updatedUser.telefon,
        geburtsdatum: updatedUser.geburtsdatum,
        fachgebiet: updatedUser.fachgebiet,
        gutachterNummer: updatedUser.gutachterNummer,
        qualifikationen: updatedUser.qualifikationen,
        adresse: updatedUser.adresse,
        firma: updatedUser.firma,
        regionen: updatedUser.regionen,
        taetigkeitsbereiche: updatedUser.taetigkeitsbereiche,
        webseite: updatedUser.webseite,
        profilbild: updatedUser.profilbild,
        benachrichtigungsEinstellungen: updatedUser.benachrichtigungsEinstellungen,
        rolle: updatedUser.rolle,
        aktiviert: updatedUser.aktiviert
      }
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Profils:', error);
    res.status(500).json({ 
      erfolg: false, 
      nachricht: 'Serverfehler beim Aktualisieren des Profils', 
      fehler: error.message 
    });
  }
};

// @desc    Alle Benutzer abrufen (nur Admin)
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({});
    res.json({
      erfolg: true,
      benutzer: users
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Benutzer:', error);
    res.status(500).json({ 
      erfolg: false, 
      nachricht: 'Serverfehler beim Abrufen der Benutzer', 
      fehler: error.message 
    });
  }
};

exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erfolg: false, nachricht: 'Kein Bild hochgeladen' });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ erfolg: false, nachricht: 'Benutzer nicht gefunden' });
    }
    // Gutachternummer aus Request (entweder aus req.body oder user)
    const gutachterNummer = req.body.gutachterNummer || user.gutachterNummer || 'UNBEKANNT';
    // Dateiname generieren
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `GUTACHTER/${gutachterNummer}/Profilbild/${user._id}_${Date.now()}.${fileExt}`;
    // In MinIO speichern
    await minioClient.putObject(
      MINIO_BUCKET,
      fileName,
      req.file.buffer,
      req.file.size,
      { 'Content-Type': req.file.mimetype }
    );
    // URL generieren
    const imageUrl = `${process.env.MINIO_PUBLIC_URL || 'http://localhost:9000'}/${MINIO_BUCKET}/${fileName}`;
    user.profilbild = imageUrl;
    await user.save();
    res.json({ erfolg: true, profilbild: imageUrl });
  } catch (error) {
    console.error('Fehler beim Profilbild-Upload:', error);
    res.status(500).json({ erfolg: false, nachricht: 'Fehler beim Profilbild-Upload', fehler: error.message });
  }
};

// @desc    Eigenes Benutzerkonto löschen
// @route   DELETE /api/users/me
// @access  Private
exports.deleteOwnAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ erfolg: false, nachricht: 'Benutzer nicht gefunden' });
    }
    await user.deleteOne();
    res.json({ erfolg: true, nachricht: 'Konto erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen des Kontos:', error);
    res.status(500).json({ erfolg: false, nachricht: 'Serverfehler beim Löschen des Kontos', fehler: error.message });
  }
};

// @desc    Passwort-Reset anfordern (E-Mail mit Link)
// @route   POST /api/users/reset-password-request
// @access  Public
exports.resetPasswordRequest = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ erfolg: false, nachricht: 'E-Mail nicht gefunden' });
    }
    // Token generieren
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 60; // 1 Stunde gültig
    await user.save();
    // Link generieren
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/passwort-zuruecksetzen/${resetToken}`;
    // E-Mail senden
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Gutachterportal <noreply@gutachterportal.de>',
      to: user.email,
      subject: 'Passwort zurücksetzen – Rechtly Gutachterportal',
      html: `<p>Sie haben eine Zurücksetzung Ihres Passworts angefordert. Klicken Sie auf den folgenden Link, um ein neues Passwort zu vergeben:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Der Link ist 1 Stunde gültig.</p>`
    });
    res.json({ erfolg: true, nachricht: 'E-Mail zum Zurücksetzen des Passworts wurde gesendet.' });
  } catch (error) {
    console.error('Fehler beim Passwort-Reset-Request:', error);
    res.status(500).json({ erfolg: false, nachricht: 'Serverfehler beim Anfordern des Passwort-Resets', fehler: error.message });
  }
};

// @desc    Passwort mit Token zurücksetzen
// @route   POST /api/users/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  const { token, neuesPasswort } = req.body;
  try {
    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ erfolg: false, nachricht: 'Ungültiger oder abgelaufener Token' });
    }
    user.passwort = neuesPasswort;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    // Benachrichtigungs-E-Mail senden
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Gutachterportal <noreply@gutachterportal.de>',
      to: user.email,
      subject: 'Ihr Passwort wurde geändert',
      html: `<p>Sehr geehrte/r ${user.vorname} ${user.nachname},</p>
             <p>Ihr Passwort für das Rechtly Gutachterportal wurde soeben erfolgreich geändert.</p>
             <p>Falls Sie diese Änderung nicht selbst vorgenommen haben, wenden Sie sich bitte umgehend an unseren Support.</p>
             <p>Mit freundlichen Grüßen,<br>Ihr Rechtly Gutachterportal-Team</p>`
    });
    res.json({ erfolg: true, nachricht: 'Passwort erfolgreich geändert.' });
  } catch (error) {
    console.error('Fehler beim Zurücksetzen des Passworts:', error);
    res.status(500).json({ erfolg: false, nachricht: 'Serverfehler beim Zurücksetzen des Passworts', fehler: error.message });
  }
}; 