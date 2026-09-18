#!/usr/bin/env node
/**
 * ============================================================
 *  SCRIPT D'AUDIT D'ISOLATION MULTI-TENANT (LECTURE SEULE)
 *  ============================================================
 *  Détecte les documents "orphelins" ou mal rattachés qui
 *  pourraient provoquer des fuites de données entre Admins.
 *
 *  Usage :
 *    node scripts/auditIsolation.js
 * ============================================================
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const User = require('../models/User');
const Boutique = require('../models/Boutique');
const Article = require('../models/Article');
const Vente = require('../models/Vente');
const Mouvement = require('../models/Mouvement');
const AjustementStock = require('../models/AjustementStock');
const Client = require('../models/Client');
const Fournisseur = require('../models/Fournisseur');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const Depense = require('../models/Depense');

const log = {
    info: (m) => console.log(`ℹ  ${m}`),
    ok: (m) => console.log(`✔  ${m}`),
    warn: (m) => console.log(`⚠  ${m}`),
    err: (m) => console.log(`✖  ${m}`),
    step: (n, m) => console.log(`[Étape ${n}] ${m}`),
};

async function connectDB() {
    const MONGO_URI = process.env.MONGO_URI_REMOTE || process.env.MONGO_URI_LOCAL || process.env.MONGO_URI;
    if (!MONGO_URI) throw new Error('Aucune URI MongoDB trouvée dans .env');
    log.step(1, `Connexion à MongoDB...`);
    await mongoose.connect(MONGO_URI);
    log.ok(`Connecté (${mongoose.connection.name})`);
}

async function audit() {
    // 1. Récupérer tous les Admins et leurs boutiques
    const admins = await User.find({ role: { $in: ['Admin', 'AdminBar'] }, deleted: { $ne: true } }).select('_id nom email role').lean();
    const boutiques = await Boutique.find().lean();
    const boutiquesByAdmin = {};
    const adminById = {};
    const allBoutiqueIds = boutiques.map(b => b._id.toString());

    admins.forEach(a => { adminById[a._id.toString()] = a; boutiquesByAdmin[a._id.toString()] = []; });
    boutiques.forEach(b => {
        const creatorId = (b.createur || '').toString();
        if (boutiquesByAdmin[creatorId]) boutiquesByAdmin[creatorId].push(b._id.toString());
    });

    console.log('\n──────────────────────────────────────────────');
    log.info(`Admins trouvés : ${admins.length}`);
    admins.forEach(a => {
        log.info(`  • ${a.nom} (${a.email}) — ${boutiquesByAdmin[a._id.toString()].length} boutique(s) — [${a._id}]`);
    });
    // Boutiques sans admin propriétaire
    const boutiquesSansAdmin = boutiques.filter(b => !adminById[(b.createur || '').toString()]);
    if (boutiquesSansAdmin.length) {
        log.warn(`${boutiquesSansAdmin.length} boutique(s) sans Admin propriétaire (createur absent/inconnu) :`);
        boutiquesSansAdmin.forEach(b => log.warn(`   - ${b.nom} (${b.codeBoutique || '?'}) createur=${b.createur || 'NULL'}`));
    }
// 2. Utilisateurs (gérants/caissiers) dont la boutique ne cadre pas avec le createur
    log.step(2, 'Contrôle des gérants/caissiers...');
    const staff = await User.find({
        role: { $in: ['Gérant', 'GérantBar', 'Serveur', 'ServeurBar', 'Caissier'] },
        deleted: { $ne: true }
    }).select('_id nom role boutique createur').lean();

    let staffFuite = 0;
    staff.forEach(u => {
        const bId = (u.boutique || '').toString();
        const cId = (u.createur || '').toString();
        let problem = null;
        if (!bId) problem = 'aucune boutique';
        else if (!allBoutiqueIds.includes(bId)) problem = 'boutique inexistante';
        else {
            const bout = boutiques.find(b => b._id.toString() === bId);
            if (!bout) problem = 'boutique introuvable';
            else if ((bout.createur || '').toString() !== cId) problem = `boutique d'un autre admin (boutique.createur=${bout.createur}) vs createur=${cId}`;
        }
        if (problem) {
            staffFuite++;
            log.err(`  STAFF ${u.role} ${u.nom} [${u._id}] → ${problem}`);
        }
    });
    if (!staffFuite) log.ok(`${staff.length} gérants/caissiers correctement rattachés.`);
    else log.warn(`${staffFuite}/${staff.length} gérants/caissiers avec problème d'isolation.`);

    // 3. Articles orphelins (sans boutique valide)
    log.step(3, 'Contrôle des Articles...');
    const articles = await Article.find().select('_id nom boutique').lean().limit(1000000);
    let articlesSansBoutique = 0, articlesBoutiqueInconnue = 0;
    articles.forEach(a => {
        if (!a.boutique) articlesSansBoutique++;
        else if (!allBoutiqueIds.includes(a.boutique.toString())) articlesBoutiqueInconnue++;
    });
    log.info(`Total articles : ${articles.length}`);
    if (articlesSansBoutique) log.err(`  • ${articlesSansBoutique} article(s) SANS boutique`);
    if (articlesBoutiqueInconnue) log.err(`  • ${articlesBoutiqueInconnue} article(s) avec boutique inexistante (référence cassée)`);
    if (!articlesSansBoutique && !articlesBoutiqueInconnue) log.ok('Aucun article orphelin.');

    // 4. Ventes orphelines
    log.step(4, 'Contrôle des Ventes...');
    const ventes = await Vente.find().select('_id prixTotal boutique').lean().limit(1000000);
    let ventesSansBoutique = 0, ventesBoutiqueInconnue = 0;
    ventes.forEach(v => {
        if (!v.boutique) ventesSansBoutique++;
        else if (!allBoutiqueIds.includes(v.boutique.toString())) ventesBoutiqueInconnue++;
    });
    log.info(`Total ventes : ${ventes.length}`);
    if (ventesSansBoutique) log.err(`  • ${ventesSansBoutique} vente(s) SANS boutique`);
    if (ventesBoutiqueInconnue) log.err(`  • ${ventesBoutiqueInconnue} vente(s) avec boutique inexistante`);
    if (!ventesSansBoutique && !ventesBoutiqueInconnue) log.ok('Aucune vente orpheline.');

    // 5. Mouvements orphelins (ni source ni destination)
    log.step(5, 'Contrôle des Mouvements...');
    const mouvements = await Mouvement.find().select('_id type boutiqueSource boutiqueDestination').lean().limit(1000000);
    let mvOrphelin = 0;
    mouvements.forEach(m => {
        const src = m.boutiqueSource ? m.boutiqueSource.toString() : null;
        const dst = m.boutiqueDestination ? m.boutiqueDestination.toString() : null;
        const hasSrc = src && allBoutiqueIds.includes(src);
        const hasDst = dst && allBoutiqueIds.includes(dst);
        if (!hasSrc && !hasDst) mvOrphelin++;
    });
    log.info(`Total mouvements : ${mouvements.length}`);
    if (mvOrphelin) log.err(`  • ${mvOrphelin} mouvement(s) sans boutique source ni destination valide`);
    else log.ok('Aucun mouvement orphelin.');
// 6. Ajustements, clients, caissiers, dépenses : contexte boutique
    async function countOrphans(Model, label) {
        const docs = await Model.find().select('_id boutique').lean().limit(1000000);
        let orphan = 0;
        docs.forEach(d => {
            const ctx = d.boutique;
            if (!ctx) orphan++;
            else if (!allBoutiqueIds.includes(ctx.toString())) orphan++;
        });
        if (orphan) log.err(`  • ${orphan}/${docs.length} ${label} à contexte invalide`);
        else log.ok(`${docs.length} ${label} corrects.`);
        return docs.length;
    }
    log.step(6, 'Contrôle des autres collections (boutique = contexte)...');
    await countOrphans(AjustementStock, 'AjustementStock');
    await countOrphans(Client, 'Clients');
    await countOrphans(OuvertureCaisse, 'OuvertureCaisse');
    await countOrphans(Depense, 'Depenses');

    // Fournisseurs : contexte = createur
    const fournisseurs = await Fournisseur.find().select('_id nom createur').lean();
    let fourOrphan = 0;
    fournisseurs.forEach(f => {
        const c = (f.createur || '').toString();
        if (!c || !adminById[c]) fourOrphan++;
    });
    if (fourOrphan) log.err(`  • ${fourOrphan}/${fournisseurs.length} fournisseurs sans Admin propriétaire valide`);
    else log.ok(`${fournisseurs.length} fournisseurs corrects.`);

    console.log('\n══════════════════════════════════════════════════');
    log.step(7, 'RÉCAPITULATIF');
    console.log('══════════════════════════════════════════════════');
    console.log(`  Admins                  : ${admins.length}`);
    console.log(`  Boutiques               : ${boutiques.length}`);
    console.log(`  Staff                  : ${staff.length}`);
    console.log(`  Articles               : ${articles.length}`);
    console.log(`  Ventes                 : ${ventes.length}`);
    console.log(`  Mouvements             : ${mouvements.length}`);
    console.log('');
    log.warn(`La cause racine des fuites restantes est corrigée dans les contrôleurs/services`);
    log.warn(`(vérification d'appartenance de la boutique à chaque mutation).`);
    console.log('══════════════════════════════════════════════════\n');
}

async function main() {
    try {
        await connectDB();
        await audit();
    } catch (e) {
        console.error('Erreur :', e.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

main();