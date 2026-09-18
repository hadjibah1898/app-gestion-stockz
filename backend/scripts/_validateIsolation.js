require('dotenv').config({path:require('path').join(process.cwd(),'.env')});
const mongoose=require('mongoose');
const User=require('./models/User');
const Boutique=require('./models/Boutique');
const Article=require('./models/Article');
const ts=require('./middleware/tenantScope');

(async()=>{
  await mongoose.connect(process.env.MONGO_URI_LOCAL);
  const admins=await User.find({role:{$in:['Admin','AdminBar']},deleted:{$ne:true}}).select('_id nom').lean();
  const results=[];
  for(const a of admins){
    const au={_id:a._id,id:a._id.toString(),role:a.role};
    const filter=await ts.getTenantFilter(au);
    const arts=await Article.find(filter).select('_id').lean();
    results.push({id:a._id.toString(),count:arts.length,ids:arts.map(x=>x._id.toString())});
    console.log('Admin '+a.nom+' -> '+arts.length+' articles');
  }
  let overlap=0;
  for(let i=0;i<results.length;i++){
    for(let j=i+1;j<results.length;j++){
      const s1=new Set(results[i].ids);
      const inter=results[j].ids.filter(id=>s1.has(id));
      if(inter.length){overlap++;console.log('CHEVAUCHEMENT entre admin',i,'et',j,':',inter.length);}
    }
  }
  console.log('=== Paires avec chevauchement d articles: '+overlap+' ===');
  await mongoose.disconnect();
})();
