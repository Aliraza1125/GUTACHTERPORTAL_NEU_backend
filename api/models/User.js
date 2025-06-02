const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  vorname: {
    type: String,
    required: [true, 'Vorname ist erforderlich']
  },
  nachname: {
    type: String,
    required: [true, 'Nachname ist erforderlich']
  },
  email: {
    type: String,
    required: [true, 'E-Mail ist erforderlich'],
    unique: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Bitte geben Sie eine gültige E-Mail-Adresse ein']
  },
  passwort: {
    type: String,
    required: [true, 'Passwort ist erforderlich'],
    minlength: 8,
    select: false
  },
  rolle: {
    type: String,
    enum: ['gutachter', 'admin'],
    default: 'gutachter'
  },
  gutachterNummer: {
    type: Number,
    unique: true
  },
  fachgebiet: {
    type: String,
    required: [true, 'Fachgebiet ist erforderlich']
  },
  telefon: {
    type: String,
    required: [true, 'Telefonnummer ist erforderlich']
  },
  geburtsdatum: {
    type: Date
  },
  firma: {
    type: String,
    required: [true, 'Firmenname ist erforderlich']
  },
  regionen: {
    type: [String],
    required: [true, 'Mindestens eine Tätigkeitsregion ist erforderlich']
  },
  taetigkeitsbereiche: {
    type: [String],
    required: [true, 'Mindestens ein Tätigkeitsbereich ist erforderlich']
  },
  webseite: {
    type: String
  },
  qualifikationen: [String],
  adresse: {
    strasse: String,
    hausnummer: String,
    plz: String,
    ort: String,
    land: { type: String, default: 'Deutschland' }
  },
  profilbild: String,
  benachrichtigungsEinstellungen: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true }
  },
  aktivierungsToken: {
    type: String
  },
  aktiviert: {
    type: Boolean,
    default: false
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  erstelltAm: {
    type: Date,
    default: Date.now
  },
  letzterLogin: Date,
  geraete: [
    {
      name: String,
      timestamp: { type: Date, default: Date.now }
    }
  ]
}, {
  timestamps: true
});

// Passwort vor dem Speichern hashen
UserSchema.pre('save', async function(next) {
  if (!this.isModified('passwort')) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.passwort = await bcrypt.hash(this.passwort, salt);
});

// Methode zum Vergleichen von Passwörtern
UserSchema.methods.vergleichePasswort = async function(eingegebenesPasswort) {
  return await bcrypt.compare(eingegebenesPasswort, this.passwort);
};

module.exports = mongoose.model('User', UserSchema); 