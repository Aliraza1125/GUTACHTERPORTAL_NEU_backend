require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const mailOptions = {
  from: process.env.EMAIL_FROM,
  to: 't.vardar4545@gmail.com',
  subject: 'SMTP-Test von Rechtly',
  text: 'Dies ist eine Testmail vom Rechtly-Backend. SMTP-Konfiguration funktioniert!',
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    return console.error('Fehler beim Senden der Testmail:', error);
  }
  console.log('Testmail gesendet:', info.response);
}); 