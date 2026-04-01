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
app.disable('x-powered-by'); // Supprime l'en-tête X-Powered-By pour cacher que le serveur utilise Express

// 1. Connexion à MongoDB
connectDB();

// Initialisation des tâches planifiées
initReminderService();

// 2. Middlewares de base
app.use((req, res, next) => {
    // Empêche les navigateurs de deviner le type MIME (MIME-sniffing)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Protection contre le Clickjacking (interdit l'affichage dans une iframe)
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Active le filtre XSS élémentaire des navigateurs
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Force l'utilisation du HTTPS (HSTS) - À ajuster si vous n'êtes pas encore en HTTPS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Contrôle les informations de provenance envoyées (Referrer)
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy (CSP) : définit les sources de contenu autorisées
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "img-src 'self' https://ui-avatars.com https://*.tile.openstreetmap.org data:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline';"
    );
    next();
});
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