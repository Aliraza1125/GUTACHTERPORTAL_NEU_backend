const mongoose = require('mongoose');

const CaseSchema = new mongoose.Schema({
  fallname: {
    type: String,
    required: [true, 'Fallname ist erforderlich']
  },
  aktenzeichen: {
    type: String,
    required: [true, 'Aktenzeichen ist erforderlich']
  },
  status: {
    type: String,
    default: 'Offen',
    enum: ['Offen', 'In Bearbeitung', 'Übermittelt', 'Abgeschlossen', 'Storniert']
  },
  datum: {
    type: Date,
    default: Date.now
  },
  mandant: {
    vorname: String,
    nachname: String,
    email: String,
    telefon: String,
    adresse: String,
    geburtsdatum: String,
    mandantennummer: String
  },
  erstPartei: {
    vorname: String,
    nachname: String,
    versicherung: String,
    kennzeichen: String,
    fahrzeughalter: String,
    kfzModell: String,
    beteiligungsposition: String
  },
  zweitPartei: {
    vorname: String,
    nachname: String,
    versicherung: String,
    kennzeichen: String,
    beteiligungsposition: String
  },
  schaden: {
    schadenstyp: String,
    schadensschwere: String,
    beschreibung: String,
    unfallort: String,
    unfallzeit: String
  },
  dokumente: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }],
  erstelltVon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  zugewiesenAn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notizen: [
    {
      text: String,
      erstelltVon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      erstelltAm: {
        type: Date,
        default: Date.now
      }
    }
  ],
  erstelltAm: {
    type: Date,
    default: Date.now
  },
  letzteAktualisierung: {
    type: Date,
    default: Date.now
  },
  gutachterNummer: {
    type: Number,
    required: true
  },
  fallNummer: {
    type: Number,
    required: true
  },
  datenschutzAngenommen: {
    type: Boolean,
    default: false
  },
  uebermittlungen: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Case', CaseSchema); 