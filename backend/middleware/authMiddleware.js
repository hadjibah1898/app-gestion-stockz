const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    let token = req.headers.authorization;

    if (token && token.startsWith('Bearer')) {
        try {
            token = token.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            res.status(401).json({ message: "Non autorisé, token invalide" });
        }
    } else {
        res.status(401).json({ message: "Aucun token trouvé" });
    }
};

// Middleware pour restreindre l'accès à l'Admin uniquement [cite: 23]
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: "Accès réservé à l'administrateur" });
    }
};

module.exports = { protect, adminOnly };