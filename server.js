const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const Minio = require('minio');

// Umgebungsvariablen laden
dotenv.config();

// Datenbankverbindung herstellen
connectDB();

// Express-App initialisieren
const app = express();

// CORS-Konfiguration - Updated for production
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174', 
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://gutachterportal-neu-frontend.vercel.app',
  'https://gutachter.rechtly.de',
  'https://www.gutachter.rechtly.de',
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL
].filter(Boolean); // Remove undefined values

console.log('🌐 Allowed CORS Origins:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS: Allowed origin:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS: Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control'
  ],
  optionsSuccessStatus: 200
}));

// Handle preflight requests
app.options('*', cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

// API-Routen
const userRoutes = require('./api/routes/users');
const caseRoutes = require('./api/routes/cases');
const documentRoutes = require('./api/routes/documents');

app.use('/api/users', userRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/documents', documentRoutes);

// Upload-Ordner öffentlich zugänglich machen (nur für Entwicklung)
if (process.env.NODE_ENV !== 'production') {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

// Statische Dateien im Produktionsmodus bereitstellen
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend/build', 'index.html'));
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    allowedOrigins: allowedOrigins
  });
});

// MinIO-Check beim Start
console.log('🔄 Versuche Verbindung zu MinIO herzustellen...');

// MinIO-Konfiguration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT?.replace(/^https?:\/\//, '') || 'localhost';
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const MINIO_PORT = MINIO_USE_SSL ? 443 : 9000; // Port 443 für SSL, 9000 für nicht-SSL
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'gutachten';

console.log('ℹ️ MinIO Konfiguration:', {
  endpoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  bucket: MINIO_BUCKET
});

// MinIO-Client mit korrekter Konfiguration
const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,
  region: 'us-east-1' // Wichtig für Render.com
});

// MinIO-Verbindung prüfen
const checkMinioConnection = async () => {
  try {
    console.log('🔄 Prüfe MinIO-Verbindung...');
    
    // Prüfe, ob der Bucket existiert
    const bucketExists = await new Promise((resolve, reject) => {
      minioClient.bucketExists(MINIO_BUCKET, (err, exists) => {
        if (err) {
          console.error('❌ MinIO: Fehler beim Prüfen des Buckets:', err);
          reject(err);
        } else {
          console.log(`ℹ️ MinIO: Bucket '${MINIO_BUCKET}' existiert:`, exists);
          resolve(exists);
        }
      });
    });

    if (bucketExists) {
      console.log('✅ MinIO: Verbindung erfolgreich hergestellt');
      console.log(`✅ MinIO: Bucket '${MINIO_BUCKET}' ist erreichbar`);
    } else {
      console.log('⚠️ MinIO: Verbindung erfolgreich, aber Bucket existiert nicht');
      console.log(`ℹ️ MinIO: Versuche Bucket '${MINIO_BUCKET}' zu erstellen...`);
      
      try {
        await new Promise((resolve, reject) => {
          minioClient.makeBucket(MINIO_BUCKET, 'us-east-1', (err) => {
            if (err) {
              console.error('❌ MinIO: Fehler beim Erstellen des Buckets:', err);
              reject(err);
            } else {
              console.log(`✅ MinIO: Bucket '${MINIO_BUCKET}' erfolgreich erstellt`);
              resolve();
            }
          });
        });
      } catch (error) {
        console.error('❌ MinIO: Fehler beim Erstellen des Buckets:', error.message);
        throw error;
      }
    }

    // Test-Upload durchführen
    try {
      const testBuffer = Buffer.from('test');
      await new Promise((resolve, reject) => {
        minioClient.putObject(
          MINIO_BUCKET,
          'test.txt',
          testBuffer,
          testBuffer.length,
          { 'Content-Type': 'text/plain' },
          (err, etag) => {
            if (err) {
              console.error('❌ MinIO: Test-Upload fehlgeschlagen:', err);
              reject(err);
            } else {
              console.log('✅ MinIO: Test-Upload erfolgreich');
              resolve(etag);
            }
          }
        );
      });
    } catch (error) {
      console.error('❌ MinIO: Test-Upload fehlgeschlagen:', error.message);
      throw error;
    }
  } catch (error) {
    console.error('❌ MinIO: Verbindung fehlgeschlagen:', error.message);
    console.error('ℹ️ MinIO: Überprüfe deine Konfiguration in der .env Datei');
    console.error('ℹ️ MinIO: Endpoint:', MINIO_ENDPOINT);
    console.error('ℹ️ MinIO: Port:', MINIO_PORT);
    console.error('ℹ️ MinIO: SSL:', MINIO_USE_SSL);
    console.error('ℹ️ MinIO: Bucket:', MINIO_BUCKET);
    throw error;
  }
};

// MinIO-Verbindung prüfen
checkMinioConnection().catch(error => {
  console.error('❌ MinIO: Kritischer Fehler bei der Initialisierung:', error);
  // Nicht beenden, sondern nur Fehler loggen
  console.error('⚠️ MinIO: Server läuft trotz MinIO-Fehler weiter');
});

// Port festlegen
const PORT = process.env.PORT || 5000;

// Server starten
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 Allowed Origins:`, allowedOrigins);
});