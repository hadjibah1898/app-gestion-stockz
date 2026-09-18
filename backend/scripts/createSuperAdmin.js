#!/usr/bin/env node
/**
 * ============================================================
 *  SCRIPT DE CRÉATION / GESTION DU SUPER ADMINISTRATEUR
 * ============================================================
 *
 *  Usage :
 *    node scripts/createSuperAdmin.js                          → crée le SuperAdmin par défaut (depuis .env ou valeurs par défaut)
 *    node scripts/createSuperAdmin.js --email x --password y   → crée avec des identifiants spécifiques
 *    node scripts/createSuperAdmin.js --list                    → liste les SuperAdmin existants
 *    node scripts/createSuperAdmin.js --reset-password          → réinitialise le mot de passe du SuperAdmin
 *    node scripts/createSuperAdmin.js --force                   → écrase le SuperAdmin existant (supprime puis recrée)
 *    node scripts/createSuperAdmin.js --help                    → affiche l'aide
 *
 *  Variables .env utilisées :
 *    SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NOM
 *    MONGO_URI_REMOTE, MONGO_URI_LOCAL, MONGO_URI
 * ============================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const readline = require('readline');
const User = require('../models/User');

// ─── Couleurs ANSI pour le terminal ──────────────────────────
const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    cyan:    '\x1b[36m',
    white:   '\x1b[37m',
    bgGreen: '\x1b[42m',
    bgRed:   '\x1b[41m',
    bgBlue:  '\x1b[44m',
};

// ─── Helpers ─────────────────────────────────────────────────
const log = {
    info:    (msg) => console.log(`${C.cyan}ℹ${C.reset}  ${msg}`),
    success: (msg) => console.log(`${C.green}✔${C.reset}  ${msg}`),
    warn:    (msg) => console.log(`${C.yellow}⚠${C.reset}  ${msg}`),
    error:   (msg) => console.log(`${C.red}✖${C.reset}  ${msg}`),
    step:    (n, msg) => console.log(`${C.blue}${C.bold}[Étape ${n}]${C.reset} ${msg}`),
    banner:  () => {
        console.log('');
        console.log(`${C.bgBlue}${C.white}${C.bold} ══════════════════════════════════════════════════════════════ ${C.reset}`);
        console.log(`${C.bgBlue}${C.white}${C.bold} ║        GESTION DU SUPER ADMINISTRATEUR - eCash           ║ ${C.reset}`);
        console.log(`${C.bgBlue}${C.white}${C.bold} ══════════════════════════════════════════════════════════════ ${C.reset}`);
        console.log('');
    },
    separator: () => console.log(`${C.dim}${'─'.repeat(60)}${C.reset}`),
};

// ─── Parser d'arguments CLI ─────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        help: false,
        list: false,
        force: false,
        resetPassword: false,
        email: null,
        password: null,
        nom: null,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--help':
            case '-h':
                opts.help = true;
                break;
            case '--list':
            case '-l':
                opts.list = true;
                break;
            case '--force':
            case '-f':
                opts.force = true;
                break;
            case '--reset-password':
            case '-r':
                opts.resetPassword = true;
                break;
            case '--email':
            case '-e':
                opts.email = args[++i] || null;
                break;
            case '--password':
            case '-p':
                opts.password = args[++i] || null;
                break;
            case '--nom':
            case '-n':
                opts.nom = args[++i] || null;
                break;
            default:
                // Ignorer les arguments inconnus
                break;
        }
    }
    return opts;
}

// ─── Afficher l'aide ─────────────────────────────────────────
function showHelp() {
    console.log(`${C.bold}Utilisation :${C.reset}`);
    console.log(`  node scripts/createSuperAdmin.js [OPTIONS]\n`);
    console.log(`${C.bold}Options :${C.reset}`);
    console.log(`  ${C.cyan}--help, -h${C.reset}              Affiche cette aide`);
    console.log(`  ${C.cyan}--list, -l${C.reset}              Liste les SuperAdmin existants`);
    console.log(`  ${C.cyan}--email, -e${C.reset} <email>     Email du SuperAdmin`);
    console.log(`  ${C.cyan}--password, -p${C.reset} <mdp>    Mot de passe du SuperAdmin`);
    console.log(`  ${C.cyan}--nom, -n${C.reset} <nom>         Nom complet du SuperAdmin`);
    console.log(`  ${C.cyan}--force, -f${C.reset}             Supprime et recrée le SuperAdmin s'il existe`);
    console.log(`  ${C.cyan}--reset-password, -r${C.reset}    Réinitialise le mot de passe\n`);
    console.log(`${C.bold}Exemples :${C.reset}`);
    console.log(`  ${C.dim}node scripts/createSuperAdmin.js${C.reset}`);
    console.log(`  ${C.dim}node scripts/createSuperAdmin.js --email admin@ecash.com --password MonMot2024!${C.reset}`);
    console.log(`  ${C.dim}node scripts/createSuperAdmin.js --list${C.reset}`);
    console.log(`  ${C.dim}node scripts/createSuperAdmin.js --reset-password${C.reset}`);
    console.log(`  ${C.dim}node scripts/createSuperAdmin.js --force -e admin@ecash.com -p NewPass123!${C.reset}\n`);
}

// ─── Lister les SuperAdmins ──────────────────────────────────
async function listSuperAdmins() {
    const admins = await User.find({ role: 'SuperAdmin' }).select('-password -__v');
    if (admins.length === 0) {
        log.warn('Aucun SuperAdmin trouvé dans la base de données.');
        return;
    }
    log.separator();
    console.log(`${C.bold}${C.green}  SuperAdmin(s) trouvé(s) : ${admins.length}${C.reset}\n`);
    admins.forEach((admin, idx) => {
        console.log(`  ${C.bold}${C.cyan}#${idx + 1}${C.reset}`);
        console.log(`    Nom      : ${C.bold}${admin.nom}${C.reset}`);
        console.log(`    Email    : ${admin.email}`);
        console.log(`    Actif    : ${admin.active ? `${C.green}Oui${C.reset}` : `${C.red}Non${C.reset}`}`);
        console.log(`    Créé le  : ${admin.createdAt ? new Date(admin.createdAt).toLocaleString('fr-FR') : 'N/A'}`);
        console.log(`    Dernière connexion : ${admin.lastLogin ? new Date(admin.lastLogin).toLocaleString('fr-FR') : 'Jamais'}`);
        if (idx < admins.length - 1) console.log('');
    });
    log.separator();
}

// ─── Demander un input utilisateur ───────────────────────────
function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// ─── Validation de l'email ───────────────────────────────────
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Validation du mot de passe ──────────────────────────────
function validatePassword(password) {
    const errors = [];
    if (password.length < 8) errors.push('au moins 8 caractères');
    if (!/[A-Z]/.test(password)) errors.push('au moins une majuscule');
    if (!/[a-z]/.test(password)) errors.push('au moins une minuscule');
    if (!/[0-9]/.test(password)) errors.push('au moins un chiffre');
    return errors;
}

// ─── Connexion à MongoDB ─────────────────────────────────────
async function connectDB() {
    const MONGO_URI = process.env.MONGO_URI_REMOTE || process.env.MONGO_URI_LOCAL || process.env.MONGO_URI;
    if (!MONGO_URI) {
        throw new Error(
            "Aucune variable de connexion trouvée.\n" +
            "  Définissez MONGO_URI_REMOTE, MONGO_URI_LOCAL ou MONGO_URI dans backend/.env"
        );
    }
    log.step(1, `Connexion à la base de données...`);
    await mongoose.connect(MONGO_URI);
    log.success(`Connecté à MongoDB (${mongoose.connection.host}/${mongoose.connection.name})`);
}

// ─── Créer le SuperAdmin ─────────────────────────────────────
async function createSuperAdmin(opts) {
    // Déterminer les valeurs (CLI > .env > defaults)
    let email = opts.email || process.env.SUPERADMIN_EMAIL || 'superadmin@ecash.com';
    let password = opts.password || process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@2024';
    let nom = opts.nom || process.env.SUPERADMIN_NOM || 'Super Administrateur';

    // Mode interactif : si aucun email/password fourni via CLI, demander
    if (!opts.email && !opts.password) {
        const useInteractive = await askQuestion(
            `${C.yellow}Mode interactif ? (o/N) : ${C.reset}`
        );
        if (useInteractive.toLowerCase() === 'o' || useInteractive.toLowerCase() === 'oui') {
            const inputEmail = await askQuestion(
                `  Email [${C.dim}${email}${C.reset}] : `
            );
            if (inputEmail) email = inputEmail;

            const inputNom = await askQuestion(
                `  Nom complet [${C.dim}${nom}${C.reset}] : `
            );
            if (inputNom) nom = inputNom;

            const inputPassword = await askQuestion(
                `  Mot de passe [${C.dim}${'•'.repeat(8)}${C.reset}] : `
            );
            if (inputPassword) password = inputPassword;
        }
    }

    // Validation
    if (!isValidEmail(email)) {
        throw new Error(`Email invalide : "${email}"`);
    }

    const pwdErrors = validatePassword(password);
    if (pwdErrors.length > 0 && !opts.force) {
        log.warn(`Le mot de passe ne respecte pas les critères de sécurité :`);
        pwdErrors.forEach(e => log.warn(`  - ${e}`));
        const continueAnyway = await askQuestion(
            `${C.yellow}  Voulez-vous continuer quand même ? (o/N) : ${C.reset}`
        );
        if (continueAnyway.toLowerCase() !== 'o' && continueAnyway.toLowerCase() !== 'oui') {
            throw new Error('Opération annulée par l\'utilisateur.');
        }
    }

    log.step(2, `Vérification des existants...`);

    // Vérifier si un SuperAdmin existe déjà
    const existingSuperAdmin = await User.findOne({ role: 'SuperAdmin' });

    if (existingSuperAdmin) {
        if (opts.resetPassword) {
            // ─── Réinitialisation du mot de passe ───
            log.step(3, `Réinitialisation du mot de passe pour ${C.bold}${existingSuperAdmin.email}${C.reset}...`);
            existingSuperAdmin.password = password; // Le pre-save hook hashera
            existingSuperAdmin.active = true;
            existingSuperAdmin.mustChangePassword = true;
            await existingSuperAdmin.save();
            log.success(`Mot de passe réinitialisé avec succès !`);
            log.info(`Nouveau mot de passe : ${C.bold}${password}${C.reset}`);
            log.warn(`L'utilisateur devra changer son mot de passe à la prochaine connexion.`);
            return;
        }

        if (opts.force) {
            // ─── Suppression et recréation ───
            log.warn(`Suppression du SuperAdmin existant (${existingSuperAdmin.email})...`);
            await User.deleteOne({ _id: existingSuperAdmin._id });
            log.success('Supprimé.');
        } else {
            // ─── Mise à jour du rôle si email déjà utilisé ───
            const existingUserWithEmail = await User.findOne({ email });
            if (existingUserWithEmail) {
                log.step(3, `L'utilisateur ${email} existe déjà (rôle: ${existingUserWithEmail.role}).`);
                log.info(`Mise à jour du rôle en SuperAdmin...`);
                existingUserWithEmail.role = 'SuperAdmin';
                existingUserWithEmail.password = password;
                existingUserWithEmail.active = true;
                existingUserWithEmail.mustChangePassword = false;
                await existingUserWithEmail.save();
                log.success(`${C.bold}${email}${C.reset} est maintenant SuperAdmin !`);
                return;
            }
            log.warn(`Un SuperAdmin existe déjà (${existingSuperAdmin.email}).`);
            log.info(`Utilisez ${C.cyan}--force${C.reset} pour le remplacer ou ${C.cyan}--reset-password${C.reset} pour changer son mot de passe.`);
            return;
        }
    }

    // ─── Création ───
    log.step(3, `Création du SuperAdmin...`);
    log.separator();
    console.log(`  ${C.bold}Nom      :${C.reset}  ${nom}`);
    console.log(`  ${C.bold}Email    :${C.reset}  ${email}`);
    console.log(`  ${C.bold}Mot de   :${C.reset}  ${'•'.repeat(password.length)}`);
    console.log(`           ${C.dim}phrase${C.reset}`);
    console.log(`  ${C.bold}Rôle     :${C.reset}  ${C.green}SuperAdmin${C.reset}`);
    log.separator();

    const superAdmin = new User({
        nom,
        email,
        password, // Le pre-save hook du modèle hashera le mot de passe
        role: 'SuperAdmin',
        active: true,
        mustChangePassword: false,
    });

    await superAdmin.save();

    console.log('');
    log.success(`${C.bold}${C.green}SuperAdmin créé avec succès !${C.reset}`);
    console.log('');
    console.log(`  ${C.bold}Email    :${C.reset}  ${C.cyan}${email}${C.reset}`);
    console.log(`  ${C.bold}Mot de   :${C.reset}  ${C.cyan}${password}${C.reset}`);
    console.log(`           ${C.dim}phrase${C.reset}`);
    console.log('');
    log.warn(`${C.bold}Conservez ces identifiants en lieu sûr !${C.reset}`);
    console.log('');
}

// ─── Point d'entrée principal ────────────────────────────────
async function main() {
    const opts = parseArgs();

    log.banner();

    if (opts.help) {
        showHelp();
        process.exit(0);
    }

    try {
        await connectDB();

        if (opts.list) {
            await listSuperAdmins();
        } else {
            await createSuperAdmin(opts);
        }
    } catch (error) {
        console.log('');
        log.error(`${C.bold}Erreur :${C.reset} ${error.message}`);
        if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
            log.info(`Vérifiez que MongoDB est démarré et que votre .env est correct.`);
        }
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        log.info('Déconnexion de la base de données.');
    }
}

main();