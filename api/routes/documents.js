const express = require('express');
const router = express.Router();
const { 
  upload, 
  uploadDocument, 
  getDocumentsByCase, 
  getDocumentById, 
  downloadDocument, 
  deleteDocument,
  getAllDocuments 
} = require('../controllers/documentController');
const { protect } = require('../middleware/authMiddleware');

// Alle Document-Routen sind geschützt
router.use(protect);

// Alle Dokumente abrufen
router.get('/', getAllDocuments);

// Dokument hochladen
router.post('/', upload.single('dokument'), uploadDocument);

// Dokumente eines Falls abrufen
router.get('/case/:caseId', getDocumentsByCase);

// Dokument nach ID abrufen, herunterladen oder löschen
router.route('/:id')
  .get(getDocumentById)
  .delete(deleteDocument);

// Dokument herunterladen
router.get('/:id/download', downloadDocument);

module.exports = router; 