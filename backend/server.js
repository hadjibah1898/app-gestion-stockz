require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db'); 
const errorHandler = require('./middleware/errorMiddleware');
const initReminderService = require('./services/reminderService'); 

// --- IMPORTATION DES ROUTES (Toutes ensemble en haut) ---
const authRoutes = require('./routes/authRoutes');
const articlesRoute = require('./routes/articlesRoute');
const venteRoutes = require('./routes/venteRoutes');
const boutiqueRoutes = require('./routes/boutiqueRoutes');
const fournisseursRoute = require('./routes/fournisseursRoute');
const mouvementsRoute = require('./routes/mouvementsRoute');
const dashboardRoutes = require('./routes/dashboardRoutes');
const clientRoutes = require('./routes/clientRoutes');
const caisseRoutes = require('./routes/caisseRoutes');
const auditRoutes = require('./routes/auditRoutes'); 

const app = express();

// 1. Connexion à MongoDB
connectDB();

// Initialisation des tâches planifiées
initReminderService();

// 2. Middlewares de base
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev')); 

// 3. Routes
app.use('/api/auth', authRoutes);
app.use('/api/articles', articlesRoute);
app.use('/api/ventes', venteRoutes);
app.use('/api/boutiques', boutiqueRoutes);
app.use('/api/fournisseurs', fournisseursRoute);
app.use('/api/mouvements', mouvementsRoute);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/caisse', caisseRoutes);
app.use('/api/audit', auditRoutes); // Maintenant, auditRoutes est bien défini

// Route de test santé
app.get('/health', (req, res) => res.status(200).json({ status: "ok", message: "Serveur actif" }));

// 4. Middleware d'erreur
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✅ Serveur démarré en mode ${process.env.NODE_ENV} sur : http://localhost:${PORT}`);
});