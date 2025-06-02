const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../api/models/User');
require('dotenv').config({ path: '../.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rechtly';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.example.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || 'user@example.com',
    pass: process.env.EMAIL_PASS || 'password'
  }
});

async function sendActivationMail(user) {
  const activationUrl = `${FRONTEND_URL}/aktivieren/${user.aktivierungsToken}`;
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Gutachterportal <noreply@gutachterportal.de>',
    to: user.email,
    subject: 'Aktivieren Sie Ihr Konto bei Rechtly Gutachterportal',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976d2;">Willkommen bei Rechtly Gutachterportal!</h2>
        <p>Sehr geehrte(r) ${user.vorname} ${user.nachname},</p>
        <p>um Ihr Konto zu aktivieren und alle Funktionen des Gutachterportals nutzen zu können, klicken Sie bitte auf den folgenden Link:</p>
        <p style="margin: 20px 0;">
          <a href="${activationUrl}" style="background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Konto aktivieren</a>
        </p>
        <p>Oder kopieren Sie diesen Link in Ihren Browser:</p>
        <p>${activationUrl}</p>
        <p>Der Link ist 24 Stunden gültig.</p>
        <p>Ihre Gutachternummer lautet: <strong>${user.gutachterNummer}</strong></p>
        <p>Mit freundlichen Grüßen,<br>Ihr Rechtly Gutachterportal-Team</p>
      </div>
    `
  };
  return transporter.sendMail(mailOptions);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const users = await User.find({ aktiviert: false });
  console.log(`Nicht aktivierte User gefunden: ${users.length}`);
  for (const user of users) {
    user.aktivierungsToken = crypto.randomBytes(32).toString('hex');
    await user.save();
    try {
      await sendActivationMail(user);
      console.log(`Aktivierungslink gesendet an: ${user.email}`);
    } catch (err) {
      console.error(`Fehler beim Senden an ${user.email}:`, err.message);
    }
  }
  await mongoose.disconnect();
  console.log('Fertig!');
}

main(); 