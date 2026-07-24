const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/stock-gestion')
  .then(() => {
    const Vente = mongoose.model('Vente', new mongoose.Schema({}, {strict: false}));
    return Vente.aggregate([
      { $group: { _id: '$orderGroupId', items: { $push: '$$ROOT' } } }
    ]).limit(1);
  })
  .then(res => {
    console.log(JSON.stringify(res, null, 2));
  })
  .catch(console.error)
  .finally(() => process.exit(0));
