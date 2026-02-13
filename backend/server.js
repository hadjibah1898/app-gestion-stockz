require('dotenv').config(); // Toujours charger les variables .env en premier
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db'); // On importe notre fonction de connexion
const errorHandler = require('./middleware/errorMiddleware');
const { protect, authorize } = require('./middleware/auth'); // Middleware d'authentification

const app = express();

// 1. Connexion à MongoDB
connectDB();

// 2. Middlewares de base
app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // Pour voir tes requêtes passer dans le terminal

// 3. Routes d'authentification
app.use('/api/auth', require('./routes/authRoutes'));

// 4. Routes protégées
app.use('/api/articles', require('./routes/articlesRoute'));
app.use('/api/ventes', require('./routes/venteRoutes'));
app.use('/api/boutiques', require('./routes/boutiqueRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

// Route de test santé
app.get('/health', (req, res) => res.status(200).json({ status: "ok", message: "Serveur actif" }));

// 4. Middleware d'erreur (DOIT être après les routes)
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✅ Serveur démarré en mode ${process.env.NODE_ENV} sur : http://localhost:${PORT}`);
});