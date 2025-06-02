const express = require('express');
const router = express.Router();
const { 
  createCase, 
  getCases, 
  getCaseById, 
  updateCase, 
  deleteCase, 
  addCaseNote, 
  patchDatenschutz, 
  sendCase 
} = require('../controllers/caseController');
const { protect, admin } = require('../middleware/authMiddleware');

// ALLE Case-Routen sind geschützt
router.use(protect);

router.get('/', getCases);
router.get('/:id', getCaseById);

router.route('/')
  .post(createCase);

router.route('/:id')
  .put(updateCase)
  .delete(deleteCase);

// Notiz zu einem Fall hinzufügen
router.post('/:id/notes', addCaseNote);

// Datenschutzerklärung-Status aktualisieren
router.patch('/:id/datenschutz', patchDatenschutz);

router.post('/send', sendCase);

module.exports = router; 