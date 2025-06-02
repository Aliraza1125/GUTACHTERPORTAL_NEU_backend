const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Dokumentname ist erforderlich']
  },
  beschreibung: String,
  dateityp: {
    type: String,
    required: [true, 'Dateityp ist erforderlich']
  },
  groesse: {
    type: Number,
    required: [true, 'Dateigröße ist erforderlich']
  },
  pfad: {
    type: String,
    required: [true, 'Dateipfad ist erforderlich']
  },
  fall: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  hochgeladenVon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  kategorie: {
    type: String,
    enum: [
      'fuehrerschein_vorne',
      'fuehrerschein_hinten',
      'personalausweis_vorne',
      'personalausweis_hinten',
      'kfz_gutachten',
      'fahrzeugschein',
      'rechnungen',
      'unfallbericht',
      'unfall_bilder',
      'sonstige',
      'atteste',
      'reparatur',
      'sonstiges'
    ],
    default: 'sonstiges'
  },
  tags: [String],
  hochgeladenAm: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Document', DocumentSchema); 