const User = require('../models/User');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    try {
        // On ne récupère JAMAIS le rôle depuis une route publique d'inscription pour des raisons de sécurité.
        // Le rôle par défaut 'Gérant' sera appliqué automatiquement par le modèle.
        const { nom, email, password } = req.body;
        const user = new User({ nom, email, password });
        await user.save();
        res.status(201).json({ message: "Utilisateur créé avec succès" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: "Identifiants invalides" });
        }

        // Création du Token JWT valide pour 24h 
        const token = jwt.sign(
            { id: user._id, role: user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.json({ token, role: user.role, nom: user.nom });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};