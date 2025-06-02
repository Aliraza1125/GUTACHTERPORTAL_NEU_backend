const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware zum Schutz von Routen
exports.protect = async (req, res, next) => {
  let token;

  // Token aus dem Authorization-Header extrahieren
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Token verifizieren
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

      // Benutzer aus der Datenbank abrufen (ohne Passwort)
      req.user = await User.findById(decoded.id).select('-passwort');

      if (!req.user) {
        return res.status(401).json({
          erfolg: false,
          nachricht: 'Nicht autorisiert, Benutzer existiert nicht mehr'
        });
      }

      next();
    } catch (error) {
      console.error('Authentifizierungsfehler:', error);
      return res.status(401).json({
        erfolg: false,
        nachricht: 'Nicht autorisiert, ungültiger Token',
        fehler: error.message
      });
    }
  } else {
    return res.status(401).json({
      erfolg: false,
      nachricht: 'Nicht autorisiert, kein Token vorhanden'
    });
  }
};

// Middleware zur Überprüfung der Admin-Rolle
exports.admin = (req, res, next) => {
  if (req.user && req.user.rolle === 'admin') {
    next();
  } else {
    res.status(403).json({
      erfolg: false,
      nachricht: 'Nicht autorisiert, nur für Administratoren'
    });
  }
}; 