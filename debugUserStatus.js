require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./api/models/User');

const MONGO_URI = process.env.MONGO_URI;
const DEBUG_EMAIL = process.argv[2] || 'info@it-techvision.de'; // E-Mail als Argument oder Standard

if (!MONGO_URI) {
  console.error('Fehler: Die Umgebungsvariable MONGO_URI ist nicht gesetzt!');
  process.exit(1);
}

async function debugUsers() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const users = await User.find({});
  if (users.length === 0) {
    console.log('Keine Gutachter in der Datenbank gefunden.');
    process.exit(0);
  }

  console.log('Übersicht aller Gutachter:');
  console.log('-------------------------------------------------------------');
  console.log('E-Mail				Name			Aktiviert	AktivierungsToken');
  console.log('-------------------------------------------------------------');
  users.forEach(user => {
    const email = user.email.padEnd(28, ' ');
    const name = `${user.vorname} ${user.nachname}`.padEnd(20, ' ');
    const aktiviert = user.aktiviert ? 'JA ' : 'NEIN';
    const token = user.aktivierungsToken ? 'JA' : 'NEIN';
    console.log(`${email}	${name}	${aktiviert}		${token}`);
  });
  console.log('-------------------------------------------------------------');

  // Details für einen bestimmten User
  const debugUser = await User.findOne({ email: DEBUG_EMAIL });
  if (debugUser) {
    console.log(`\nVollständige Daten für ${DEBUG_EMAIL}:`);
    console.log(JSON.stringify(debugUser, null, 2));
  } else {
    console.log(`\nKein User mit der E-Mail ${DEBUG_EMAIL} gefunden.`);
  }
  process.exit(0);
}

debugUsers().catch(err => {
  console.error('Fehler beim Debuggen:', err);
  process.exit(1);
}); 