const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gutachterportal');
    
    console.log(`MongoDB verbunden: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Fehler bei der MongoDB-Verbindung: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB; 