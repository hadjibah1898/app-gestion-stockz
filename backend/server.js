require('dotenv').config(); 
console.log(`[SERVER DEBUG] process.env.MONGO_URI_REMOTE from server.js: ${process.env.MONGO_URI_REMOTE ? 'Configured' : 'NOT Configured'}`);
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db'); 
const errorHandler = require('./middleware/errorMiddleware');
const initReminderService = require('./services/reminderService'); 
const { initSyncService } = require('./services/syncService');

// --- IMPORTATION DES ROUTES ---
const authRoutes = require('./routes/authRoutes');
const articleRoutes = require('./routes/articleRoutes');
const venteRoutes = require('./routes/venteRoutes');
const boutiqueRoutes = require('./routes/boutiqueRoutes');
const fournisseursRoute = require('./routes/fournisseursRoute');
const mouvementsRoute = require('./routes/mouvementsRoute');
const dashboardRoutes = require('./routes/dashboardRoutes');
const clientRoutes = require('./routes/clientRoutes');
const caisseRoutes = require('./routes/caisseRoutes');
const auditRoutes = require('./routes/auditRoutes'); 
const cacheRoutes = require('./routes/cacheRoutes');
const serveurRoutes = require('./routes/serveurRoutes');

const app = express();
const server = http.createServer(app);

// --- CONFIGURATION DE BASE DU SERVEUR ---
app.set('trust proxy', 1); // Détection HTTPS derrière IIS ARR
app.disable('x-powered-by'); // Cache la signature d'Express

// --- Configuration des Origines ---
const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
const defaultOrigins = [
    "http://localhost:3000", 
    "https://shop.ecash-guinee.com", 
    "https://www.shop.ecash-guinee.com",
    "http://127.0.0.1:3000",
    "http://192.168.100.197:3000",
    "http://192.168.1.15:3000"
];
const allowedOrigins = [...new Set([...envOrigins, ...defaultOrigins])];

// --- MIDDLEWARES DE SÉCURITÉ HTTP NETTOYÉS (Placés en haut) ---
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});

// --- CORS Configuration (Partagée) ---
const corsOptions = {
    origin: (origin, callback) => {
        // En développement, on autorise toutes les origines pour faciliter l'accès via le réseau local/mobile
        if (!origin || origin === "null" || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "X-HTTP-Method-Override"],
    optionsSuccessStatus: 200
};

// Application des CORS juste après les en-têtes de base
app.use(cors(corsOptions)); 

// CORRECTION DU CRASH : Utilisation d'une RegExp native (.*) pour intercepter tous les Preflights OPTIONS
// Cette syntaxe contourne totalement le parseur de chaînes de caractères de path-to-regexp
app.options(/(.*)/, cors(corsOptions)); 

// --- Socket.io ---
const io = new Server(server, { 
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: corsOptions,
    transports: ['websocket', 'polling'], // Priorité au WebSocket pour la performance
    connectTimeout: 45000
});
global.io = io;

// --- Connexion DB ---
connectDB();

// --- Gestion des salons Socket.io ---
io.on('connection', (socket) => {
    console.log(`⚡ Client connecté : ${socket.id}`);
    socket.on('join_boutique_room', (boutiqueId) => socket.join(`boutique_${boutiqueId}`));
    socket.on('join_user_room', (userId) => socket.join(`user_${userId}`));
    socket.on('join_admin_room', () => socket.join('admin_room'));
    socket.on('disconnect', () => console.log('🔥 Client déconnecté'));
});

// --- Services ---
initReminderService();
initSyncService();

// --- Middlewares Standards de Restructuration des Requêtes ---
app.use(compression()); 
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev')); 

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/ventes', venteRoutes);
app.use('/api/boutiques', boutiqueRoutes);
app.use('/api/fournisseurs', fournisseursRoute);
app.use('/api/mouvements', mouvementsRoute);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/caisse', caisseRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/cache', cacheRoutes);
app.use('/api/serveurs', serveurRoutes);

// --- Route santé ---
app.get('/api/health', (req, res) => res.status(200).json({ status: "ok", message: "Serveur actif" }));

// --- Middleware d'erreur ---
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`✅ Serveur démarré en mode ${process.env.NODE_ENV} sur : http://localhost:${PORT}`);
});