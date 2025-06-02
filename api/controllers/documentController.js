const Document = require('../models/Document');
const Case = require('../models/Case');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Minio = require('minio');

// MinIO Konfiguration
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT?.replace(/^https?:\/\//, '') || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD
});
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'gutachten';

// Dateifilter für erlaubte Dateitypen
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf', 
    'image/jpeg', 
    'image/png', 
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Ungültiger Dateityp. Erlaubt sind nur PDF, Bilder, Word und Excel Dateien.'), false);
  }
};

// Multer MemoryStorage für direkten Upload zu MinIO
const storage = multer.memoryStorage();
exports.upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Limit
  fileFilter: fileFilter
});

// @desc    Dokument hochladen
// @route   POST /api/documents
// @access  Private
exports.uploadDocument = async (req, res) => {
  try {
    console.log('📥 Upload-Request erhalten:', {
      file: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : 'Keine Datei',
      body: req.body
    });

    if (!req.file) {
      console.error('❌ Keine Datei im Request gefunden');
      return res.status(400).json({
        erfolg: false,
        nachricht: 'Keine Datei hochgeladen'
      });
    }

    const { name, beschreibung, kategorie, tags, fallId } = req.body;

    // Prüfen, ob der Fall existiert
    const fall = await Case.findById(fallId).populate('mandant').populate('erstelltVon');
    if (!fall) {
      console.error('❌ Fall nicht gefunden:', fallId);
      return res.status(404).json({ erfolg: false, nachricht: 'Fall nicht gefunden' });
    }

    // Zugriffsberechtigung prüfen
    if (
      req.user.rolle !== 'admin' && 
      fall.erstelltVon.toString() !== req.user.id && 
      (!fall.zugewiesenAn || fall.zugewiesenAn.toString() !== req.user.id)
    ) {
      console.error('❌ Keine Berechtigung für Fall:', fallId);
      return res.status(403).json({
        erfolg: false,
        nachricht: 'Keine Berechtigung zum Hochladen von Dokumenten für diesen Fall'
      });
    }

    // MinIO-Pfad aufbauen
    const gutachterNummer = fall.erstelltVon.gutachterNummer || '00000';
    const fallNummer = fall.fallNummer ? fall.fallNummer.toString().padStart(5, '0') : '00000';
    
    // Mandantennummer aus dem Fall verwenden oder neu generieren
    const mandantNummer = fall.mandant?.mandantennummer || 
                          `MD-${(100 + (fall.fallNummer || 1)).toString().padStart(6, '0')}`;
    
    const dokumentName = name || req.file.originalname;
    
    const minioPath = `GUTACHTER/${gutachterNummer}/${fallNummer}/${mandantNummer}/${kategorie}/${dokumentName}`;
    console.log('📁 MinIO-Pfad:', minioPath);

    // Datei zu MinIO hochladen
    try {
      console.log('🔄 Starte MinIO-Upload...', {
        bucket: MINIO_BUCKET,
        path: minioPath,
        size: req.file.size,
        type: req.file.mimetype
      });

      // Prüfe, ob der Bucket existiert
      const bucketExists = await new Promise((resolve, reject) => {
        minioClient.bucketExists(MINIO_BUCKET, (err, exists) => {
          if (err) {
            console.error('❌ Fehler beim Prüfen des Buckets:', err);
            reject(err);
          } else {
            console.log(`ℹ️ Bucket '${MINIO_BUCKET}' existiert:`, exists);
            resolve(exists);
          }
        });
      });

      if (!bucketExists) {
        console.log(`ℹ️ Erstelle Bucket '${MINIO_BUCKET}'...`);
        await new Promise((resolve, reject) => {
          minioClient.makeBucket(MINIO_BUCKET, (err) => {
            if (err) {
              console.error('❌ Fehler beim Erstellen des Buckets:', err);
              reject(err);
            } else {
              console.log(`✅ Bucket '${MINIO_BUCKET}' erstellt`);
              resolve();
            }
          });
        });
      }

      // Upload durchführen
      await new Promise((resolve, reject) => {
        minioClient.putObject(
          MINIO_BUCKET,
          minioPath,
          req.file.buffer,
          req.file.size,
          {
            'Content-Type': req.file.mimetype
          },
          (err, etag) => {
            if (err) {
              console.error('❌ MinIO Upload-Fehler:', err);
              reject(err);
            } else {
              console.log('✅ MinIO Upload erfolgreich, ETag:', etag);
              resolve(etag);
            }
          }
        );
      });

      console.log('✅ Datei erfolgreich zu MinIO hochgeladen');
    } catch (minioError) {
      console.error('❌ MinIO Upload-Fehler:', {
        message: minioError.message,
        code: minioError.code,
        stack: minioError.stack
      });
      throw new Error(`Fehler beim Hochladen zu MinIO: ${minioError.message}`);
    }

    // Dokument-Metadaten in MongoDB speichern
    const document = await Document.create({
      name: dokumentName,
      beschreibung,
      dateityp: req.file.mimetype,
      groesse: req.file.size,
      pfad: minioPath,
      fall: fallId,
      hochgeladenVon: req.user.id,
      kategorie: kategorie || 'Sonstiges',
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    });
    console.log('✅ Dokument-Metadaten in MongoDB gespeichert');

    // Dokument zum Fall hinzufügen
    fall.dokumente.push(document._id);
    fall.letzteAktualisierung = Date.now();
    await fall.save();
    console.log('✅ Dokument zum Fall hinzugefügt');

    res.status(201).json({
      erfolg: true,
      nachricht: 'Dokument erfolgreich hochgeladen',
      dokument: document
    });
  } catch (error) {
    console.error('❌ Fehler beim Hochladen des Dokuments:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Hochladen des Dokuments',
      fehler: error.message
    });
  }
};

// @desc    Dokumente eines Falls abrufen
// @route   GET /api/documents/case/:caseId
// @access  Private
exports.getDocumentsByCase = async (req, res) => {
  try {
    const { caseId } = req.params;

    // Prüfen, ob der Fall existiert
    const fall = await Case.findById(caseId);
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
        nachricht: 'Keine Berechtigung zum Abrufen von Dokumenten für diesen Fall'
      });
    }

    const documents = await Document.find({ fall: caseId })
      .populate('hochgeladenVon', 'vorname nachname email')
      .sort({ hochgeladenAm: -1 });

    res.json({
      erfolg: true,
      dokumente: documents
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Dokumente:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Abrufen der Dokumente',
      fehler: error.message
    });
  }
};

// @desc    Dokument nach ID abrufen
// @route   GET /api/documents/:id
// @access  Private
exports.getDocumentById = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate('hochgeladenVon', 'vorname nachname email')
      .populate('fall', 'fallnummer titel');

    if (!document) {
      return res.status(404).json({
        erfolg: false,
        nachricht: 'Dokument nicht gefunden'
      });
    }

    // Zugriffsberechtigung prüfen
    const fall = await Case.findById(document.fall);
    
    if (
      req.user.rolle !== 'admin' && 
      fall.erstelltVon.toString() !== req.user.id && 
      (!fall.zugewiesenAn || fall.zugewiesenAn.toString() !== req.user.id)
    ) {
      return res.status(403).json({
        erfolg: false,
        nachricht: 'Keine Berechtigung zum Abrufen dieses Dokuments'
      });
    }

    // Signierte URL für den Zugriff generieren (gültig für 24 Stunden)
    try {
      const presignedUrl = await new Promise((resolve, reject) => {
        minioClient.presignedGetObject(
          MINIO_BUCKET, 
          document.pfad, 
          24 * 60 * 60, // 24 Stunden in Sekunden
          (err, url) => {
            if (err) {
              console.error('❌ Fehler beim Generieren der signierten URL:', err);
              reject(err);
            } else {
              resolve(url);
            }
          }
        );
      });
      
      // URL dem Dokument hinzufügen
      document._doc.url = presignedUrl;
      
      res.json({
        erfolg: true,
        dokument: document
      });
    } catch (urlError) {
      console.error('❌ Fehler bei der URL-Generierung:', urlError);
      res.status(500).json({
        erfolg: false,
        nachricht: 'Fehler bei der URL-Generierung',
        fehler: urlError.message
      });
    }
  } catch (error) {
    console.error('Fehler beim Abrufen des Dokuments:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Abrufen des Dokuments',
      fehler: error.message
    });
  }
};

// @desc    Dokument herunterladen
// @route   GET /api/documents/:id/download
// @access  Private
exports.downloadDocument = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        erfolg: false,
        nachricht: 'Dokument nicht gefunden'
      });
    }

    // Zugriffsberechtigung prüfen
    const fall = await Case.findById(document.fall);
    
    if (
      req.user.rolle !== 'admin' && 
      fall.erstelltVon.toString() !== req.user.id && 
      (!fall.zugewiesenAn || fall.zugewiesenAn.toString() !== req.user.id)
    ) {
      return res.status(403).json({
        erfolg: false,
        nachricht: 'Keine Berechtigung zum Herunterladen dieses Dokuments'
      });
    }

    // Prüfen, ob die Datei existiert
    if (!fs.existsSync(document.pfad)) {
      return res.status(404).json({
        erfolg: false,
        nachricht: 'Datei nicht gefunden'
      });
    }

    res.download(document.pfad, document.name);
  } catch (error) {
    console.error('Fehler beim Herunterladen des Dokuments:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Herunterladen des Dokuments',
      fehler: error.message
    });
  }
};

// @desc    Dokument löschen
// @route   DELETE /api/documents/:id
// @access  Private
exports.deleteDocument = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        erfolg: false,
        nachricht: 'Dokument nicht gefunden'
      });
    }

    // Zugriffsberechtigung prüfen
    const fall = await Case.findById(document.fall);
    
    if (
      req.user.rolle !== 'admin' && 
      fall.erstelltVon.toString() !== req.user.id && 
      document.hochgeladenVon.toString() !== req.user.id
    ) {
      return res.status(403).json({
        erfolg: false,
        nachricht: 'Keine Berechtigung zum Löschen dieses Dokuments'
      });
    }

    // Datei vom Dateisystem löschen
    if (fs.existsSync(document.pfad)) {
      fs.unlinkSync(document.pfad);
    }

    // Dokument aus der Datenbank löschen
    await document.deleteOne();

    // Dokument aus dem Fall entfernen
    await Case.findByIdAndUpdate(
      document.fall,
      { $pull: { dokumente: document._id }, letzteAktualisierung: Date.now() }
    );

    res.json({
      erfolg: true,
      nachricht: 'Dokument erfolgreich gelöscht'
    });
  } catch (error) {
    console.error('Fehler beim Löschen des Dokuments:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Löschen des Dokuments',
      fehler: error.message
    });
  }
};

// @desc    Alle Dokumente abrufen
// @route   GET /api/documents
// @access  Private
exports.getAllDocuments = async (req, res) => {
  try {
    // Filter für den aktuellen Benutzer erstellen
    const filter = {};
    
    // Wenn nicht Admin, dann nur Dokumente zeigen, auf die der Benutzer Zugriff hat
    if (req.user.rolle !== 'admin') {
      // Zunächst alle Fälle finden, auf die der Benutzer Zugriff hat
      const userCases = await Case.find({
        $or: [
          { erstelltVon: req.user.id },
          { zugewiesenAn: req.user.id }
        ]
      });
      
      // Fallbezogenen Filter erstellen (Dokumente, die zu diesen Fällen gehören)
      if (userCases.length > 0) {
        filter.fall = { $in: userCases.map(c => c._id) };
      } else {
        // Wenn keine Fälle gefunden wurden, leere Liste zurückgeben
        return res.json({ erfolg: true, dokumente: [], gesamt: 0, seite: 1, seiten: 1 });
      }
    }
    
    // Filter für den Namen des Dokuments (falls angegeben)
    if (req.query.name) {
      // Erweiterte Suche in name und titel
      filter.$or = [
        { name: { $regex: req.query.name, $options: 'i' } },
        { titel: { $regex: req.query.name, $options: 'i' } }
      ];
    }
    
    // Filter für die Kategorie des Dokuments (falls angegeben)
    if (req.query.kategorie) {
      filter.kategorie = req.query.kategorie;
    }
    
    // Sortierung und Paginierung
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100; // Höheres Limit (100 statt 50)
    const skip = (page - 1) * limit;
    
    console.log('🔍 Abfrage-Filter für Dokumente:', filter);
    
    // Dokumente mit Filter abrufen und populieren
    const documents = await Document.find(filter)
      .populate('hochgeladenVon', 'vorname nachname email')
      .populate({
        path: 'fall',
        select: 'fallname gutachterNummer fallNummer aktenzeichen status mandant',
        populate: [
          {
            path: 'erstelltVon',
            select: 'vorname nachname email gutachterNummer'
          },
          {
            path: 'mandant',
            select: 'vorname nachname mandantennummer'
          }
        ]
      })
      .sort({ hochgeladenAm: -1 })
      .skip(skip)
      .limit(limit);
    
    // Gesamtzahl für Paginierung
    const total = await Document.countDocuments(filter);
    
    console.log(`📊 ${documents.length} Dokumente gefunden. Gesamt: ${total}`);
    
    res.json({
      erfolg: true,
      seite: page,
      seiten: Math.ceil(total / limit),
      gesamt: total,
      dokumente: documents
    });
  } catch (error) {
    console.error('❌ Fehler beim Abrufen aller Dokumente:', error);
    res.status(500).json({
      erfolg: false,
      nachricht: 'Serverfehler beim Abrufen aller Dokumente',
      fehler: error.message
    });
  }
}; 