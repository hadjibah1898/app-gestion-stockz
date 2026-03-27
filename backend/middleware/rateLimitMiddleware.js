/**
 * Middleware de limitation de débit simple (Rate Limiter)
 * Stocke temporairement les tentatives par adresse IP en mémoire.
 */

const loginAttempts = new Map();

const rateLimiter = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();

        if (!loginAttempts.has(ip)) {
            loginAttempts.set(ip, { count: 1, firstRequest: now });
            return next();
        }

        const record = loginAttempts.get(ip);

        // Si la fenêtre de temps est écoulée, on réinitialise
        if (now - record.firstRequest > windowMs) {
            record.count = 1;
            record.firstRequest = now;
            return next();
        }

        record.count++;
        if (record.count > maxRequests) {
            return res.status(429).json({ message: "Trop de requêtes. Veuillez réessayer dans 15 minutes." });
        }

        next();
    };
};

module.exports = rateLimiter;