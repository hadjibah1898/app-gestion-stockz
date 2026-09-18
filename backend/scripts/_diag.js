require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });
const mongoose = require('mongoose');
const Article = require('../models/Article');
const Boutique = require('../models/Boutique');

(async () => {
    await mongoose.connect(process.env.MONGO_URI_LOCAL);
    const bts = await Boutique.find().select('nom _id').lean();
    console.log('=== Boutiques ===');
    bts.forEach(b => console.log(`  ${b._id.toString()} -> ${b.nom}`));
    const boutiqueIds = bts.map(b => b._id.toString());

    const arts = await Article.find().select('_id nom boutique').lean();
    console.log('=== Articles (5 exemples) ===');
    arts.slice(0, 5).forEach(a => {
        console.log(`  art ${a._id.toString()} nom=${a.nom} boutique=${a.boutique ? a.boutique.toString() : 'NULL'} type=${typeof a.boutique}`);
    });

    // Compter les articles dont la boutique est dans la liste
    let ok = 0, ko = 0;
    arts.forEach(a => {
        if (a.boutique && boutiqueIds.includes(a.boutique.toString())) ok++;
        else ko++;
    });
    console.log(`Articles OK=${ok} KO=${ko}`);
    await mongoose.disconnect();
})();