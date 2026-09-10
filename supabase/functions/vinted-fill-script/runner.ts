// Det, bogmærket faktisk kører. Bogmærket selv er kun en indlæser, der henter
// denne tekst og evaluerer den — så en rettelse her rammer telefonen med det
// samme, uden at bogmærket skal installeres forfra.
//
// Vinteds formular bygger sig selv efterhånden: mærke, størrelse, stand og
// farve findes slet ikke i DOM'en, før en kategori er valgt. Derfor er
// rækkefølgen nedenfor ikke til pynt — kategori skal igennem først.
//
// Vælgerne er React-dialoger. Rækkerne er ikke <button>, men div'er med en
// onClick-prop, så vi finder dem på netop den prop og klikker rigtigt.
// Tekstfelterne får værdien via den native value-setter, ellers opdager React
// den ikke.
//
// Skrevet uden template literals: teksten bliver selv lagt i en template
// literal nedenfor.
export const RUNNER = String.raw`
(async function(){
var API=window.__UDBAKKE_API__;
var DRAFT_ID=null;
// Spor hvert trin. Naar noget gaar galt paa telefonen, staar det i
// window.__UDBAKKE_LOG__ i stedet for at vaere usynligt.
var LOG=window.__UDBAKKE_LOG__=[];
function log(s){LOG.push(Math.round(performance.now()/100)/10+'s '+s)}

// Hvert eneste ventetraek herunder er begraenset, saa udfyldningen kan ikke gaa
// i staa. Et kaplaeb mod en tidsudloeser ville ikke standse det, den gav op
// paa - to vaelgere ville saa arbejde oven i hinanden og lukke hinandens
// dialoger. Det eneste, der reelt kan haenge, er et netvaerkskald, og de faar
// deres egen afbryder.
function timedFetch(url,opts,ms){
 var c=new AbortController();
 var timer=setTimeout(function(){c.abort()},ms||25000);
 return fetch(url,Object.assign({},opts||{},{signal:c.signal}))
  .finally(function(){clearTimeout(timer)});
}
function q(s){return document.querySelector(s)}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function norm(s){return (s||'').replace(/\s+/g,' ').trim().toLowerCase()}

function setv(el,v){
 var p=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(p,'value').set.call(el,v);
 el.dispatchEvent(new Event('input',{bubbles:true}));
 el.dispatchEvent(new Event('change',{bubbles:true}));
}

function modal(){return document.querySelector('.ReactModal__Content')}

// Vinteds rækker er div'er med en React-onClick. Den prop er den eneste
// pålidelige markør for "det her kan klikkes".
function clickables(root){
 return Array.prototype.slice.call(root.querySelectorAll('*')).filter(function(e){
  var k=Object.keys(e).find(function(k){return k.indexOf('__reactProps')===0});
  return k&&e[k].onClick;
 });
}

// Eksakt match først. Derefter præfiks — standene har en hel forklaring
// hængende efter navnet. Korteste træffer vinder, så vi rammer selve rækken
// og ikke en beholder, der indeholder den.
function pick(root,label){
 if(!root||!label)return null;
 var n=norm(label);
 var c=clickables(root).map(function(e){return{e:e,t:norm(e.textContent)}}).filter(function(x){return x.t});
 var m=c.filter(function(x){return x.t===n});
 if(!m.length)m=c.filter(function(x){return x.t.indexOf(n)===0});
 if(!m.length)m=c.filter(function(x){return x.t.indexOf(n)>-1});
 if(!m.length)return null;
 m.sort(function(a,b){return a.t.length-b.t.length});
 return m[0].e;
}

async function waitChange(before,ms){
 var end=Date.now()+(ms||2500);
 while(Date.now()<end){
  var m=modal();
  if(!m)return null;
  if(norm(m.textContent)!==before)return m;
  await sleep(100);
 }
 return modal();
}

async function save(){
 var m=modal();if(!m)return;
 var b=m.querySelector('[data-testid="input-dropdown-save-button"]')||pick(m,'Gem');
 if(b){b.click();await sleep(800)}
}

// Et designermærke får Vinted til at skyde en ægthedsdialog ind ovenpå.
// Den skal væk, ellers rammer næste klik den forkerte dialog.
async function closeStray(){
 for(var i=0;i<3;i++){
  var m=modal();if(!m)return;
  var c=m.querySelector('[data-testid$="close-button"]');
  if(!c)return;
  c.click();await sleep(500);
 }
}

// React tegner formularen om, mens billederne uploades og kategorien vaelges.
// Et klik paa en knude, der lige er blevet skiftet ud, sker i det tomme rum -
// derfor slaas feltet op paa ny for hvert forsoeg.
async function open(id){
 await closeStray();
 // Feltet kan have sin handler, laenge foer Vinted har hentet de data,
 // dialogen skal vise - saa foerste klik falder tomt til jorden. Derfor bankes
 // der paa med korte mellemrum i stedet for at vente et langt traek ad gangen.
 for(var forsoeg=0;forsoeg<12;forsoeg++){
  var m=modal();if(m)return m;
  var el=q('#'+id);
  if(!el)return null;
  if(reactReady(el))el.click();
  for(var i=0;i<6;i++){m=modal();if(m)return m;await sleep(250)}
 }
 log(id+': dialogen ville ikke åbne');
 return null;
}

function filled(id){var e=q('#'+id);return !!(e&&norm(e.value))}

// Raekkerne i en vaelger, som de faktisk staar paa skaermen. "Gem" og tomme
// raekker er ikke valgmuligheder.
// Vaelgeren gentager det allerede valgte som overskrift oeverst. Den raekke er
// ikke et valg - klikker man den, ryger man ud af traeet igen.
function options(root,skip){
 var seen={},dead={};
 (skip||[]).forEach(function(v){dead[norm(v)]=1});
 return clickables(root).map(function(e){return{e:e,t:(e.textContent||'').replace(/\s+/g,' ').trim()}})
  .filter(function(x){
   // Standene baerer hele forklaringen med sig ("Tilfredsstillende" + "En
   // hyppigt anvendt artikel med ufuldkommenheder ..."), saa graensen skal
   // vaere rundhaandet. Det er "korteste traeffer vinder", der holder os fra
   // at ramme en beholder i stedet for raekken.
   if(!x.t||x.t.length>260)return false;
   if(norm(x.t)==='gem'||norm(x.t)==='størrelsesvejledning'||norm(x.t)==='se mere')return false;
   if(dead[norm(x.t)])return false;
   if(seen[x.t])return false;
   seen[x.t]=1;return true;
  });
}

// Vinteds ordlyd kan ingen gætte - "Tøj til drenge", ikke "Drengetøj". Så vi
// sender de muligheder, der står på skærmen, og får valgt et nummer.
async function ask(kind,chosen,opts,hint){
 try{
  var r=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:DRAFT_ID,mode:'choose',kind:kind,chosen:chosen,hint:hint,options:opts.map(function(o){return o.t})})},30000);
  var j=await r.json();
  return (j.index>=0&&j.index<opts.length)?opts[j.index].e:null;
 }catch(e){return null}
}

// Eget gæt først — det sparer et opslag, når ordlyden allerede passer.
// Præfiks tæller med: standene har hele forklaringen hængende efter navnet
// ("Tilfredsstillende" + "En hyppigt anvendt artikel med ..."). Korteste
// træffer vinder, så vi rammer selve rækken og ikke noget, der rummer den.
async function choose(root,kind,chosen,label){
 var opts=options(root,chosen);
 if(!opts.length)return null;
 if(label){
  var n=norm(label);
  var hit=opts.filter(function(o){return norm(o.t)===n});
  if(!hit.length)hit=opts.filter(function(o){return norm(o.t).indexOf(n)===0});
  if(hit.length){
   hit.sort(function(a,b){return a.t.length-b.t.length});
   return hit[0].e;
  }
 }
 return await ask(kind,chosen,opts,label);
}

// Kategorivælgeren skal helt i bund: "Gem" på et mellemniveau kasserer valget,
// mens "Gem" på et blad gemmer det. Bunden kender man på, at der ikke er flere
// punkter at vælge — kun Gem-knappen står tilbage. Så: klik dig ned, til der
// ikke er mere, og gem så. Blev feltet ikke udfyldt, prøves der forfra én gang.
async function categoryOnce(path){
 var m=await open('category');if(!m)return false;
 var chosen=[];
 for(var i=0;i<8;i++){
  var cur=modal();
  if(!cur)break; // dialogen lukkede = bladet er valgt
  var before=norm(cur.textContent);
  // AI'ens eget forslag prøves først; ellers vælges der blandt Vinteds egne.
  var t=await choose(cur,'kategori',chosen,path&&path[i]);
  if(!t){log('kategori: i bund efter '+i+' niveauer');break}
  var label=(t.textContent||'').replace(/\s+/g,' ').trim().slice(0,40);
  chosen.push(label);
  log('kategori niveau '+(i+1)+': '+label);
  t.click();
  await waitChange(before,4000);
 }
 // Vi er i bund: bekræft bladet.
 await save();
 if(modal())await closeStray();
 return filled('category');
}

async function fillCategory(path){
 if(await categoryOnce(path))return null;
 log('kategori: prøver forfra');
 return await categoryOnce(path)?null:'kategori';
}

async function fillBrand(brand){
 if(!brand)return null;
 var m=await open('brand');if(!m)return 'mærke';
 var s=m.querySelector('#brand-search-input');
 if(s){s.focus();setv(s,brand);await sleep(1800)}
 var t=await choose(modal()||m,'mærke',[],brand);
 if(!t){await closeStray();return 'mærke'}
 t.click();await sleep(900);
 await save();await closeStray();
 return filled('brand')?null:'mærke';
}

async function fillSize(size,scale){
 if(!size)return null;
 var m=await open('size');if(!m)return 'størrelse';
 if(scale){var c=pick(m,scale);if(c){c.click();await sleep(800)}}
 var t=await choose(modal()||m,'størrelse',[],size);
 if(!t){await closeStray();return 'størrelse'}
 t.click();await sleep(800);
 await save();await closeStray();
 return filled('size')?null:'størrelse';
}

async function fillPick(id,label,name){
 if(!label)return null;
 var m=await open(id);if(!m)return name;
 var t=await choose(m,name,[],label);
 if(!t){await closeStray();return name}
 t.click();await sleep(800);
 await save();await closeStray();
 return filled(id)?null:name;
}

// Vinted laeser filerne af selve input-feltet. En side maa ikke AABNE
// filvaelgeren, men den maa godt lagge filer i feltet og sige til - saa
// billederne kan faktisk komme med hele vejen.
async function fillPhotos(urls){
 if(!urls||!urls.length)return 'billeder';
 var inp=document.querySelector('[data-testid="add-photos-input"]');
 if(!inp)return 'billeder';
 var dt=new DataTransfer(),n=0;
 for(var i=0;i<urls.length;i++){
  try{
   var b=await(await timedFetch(urls[i],{cache:'no-store'},30000)).blob();
   if(!b.size)continue;
   dt.items.add(new File([b],'foto'+(i+1)+'.jpg',{type:b.type||'image/jpeg'}));
   n++;
  }catch(e){}
 }
 if(!n)return 'billeder';
 inp.files=dt.files;
 inp.dispatchEvent(new Event('change',{bubbles:true}));
 // Vent til miniaturerne staar der, saa uploaden er i gang foer vi gaar videre.
 for(var j=0;j<40;j++){
  if(document.querySelectorAll('[data-testid="media-upload-grid"] img').length>=n)return null;
  await sleep(250);
 }
 return null;
}

// React kobler sig paa formularen et stykke tid efter, at HTML'en staar der.
// Trykker man paa bogmaerket i det mellemrum, sker der ingenting ved et klik -
// knuden ser rigtig ud, men har ingen handler. Saa vi venter paa, at feltet
// faktisk har faaet sin onClick.
function reactReady(el){
 if(!el)return false;
 var k=Object.keys(el).find(function(k){return k.indexOf('__reactProps')===0});
 return !!(k&&el[k].onClick);
}
async function waitReady(){
 for(var i=0;i<60;i++){
  if(reactReady(q('#category')))return true;
  await sleep(250);
 }
 return false;
}

var t=q('#title'),de=q('#description'),pe=q('#price');
if(!t||!de||!pe){alert('Udbakke: du er ikke på opret-siden. Gå til Vinted → Sælg nu, og tryk på bogmærket der.');return}

try{
 var d=await(await fetch(API)).json();
 if(d.empty){alert('Udbakke: ingen klar udkast i køen.');return}
 DRAFT_ID=d.id;
 log('siden klar: '+(await waitReady()));

 // Priser mod rigtige, aktive annoncer. Opslaget sker herfra, fra din egen
 // session — Vinted blokerer serverkald, men aldrig sin egen side.
 var price=d.price,note='foreløbig pris';
 if(d.needsPricing&&d.searchQuery){
  try{
   var r=await fetch('/api/v2/catalog/items?search_text='+encodeURIComponent(d.searchQuery)+'&order=relevance&page=1&per_page=12',{headers:{'Accept':'application/json'},credentials:'include'});
   if(r.ok){
    var comps=((await r.json()).items||[]).map(function(i){return{title:i.title,price:(i.price&&i.price.amount)||String(i.price||''),currency:(i.price&&i.price.currency_code)||'DKK'}}).filter(function(x){return x.price});
    if(comps.length){
     var pj=await(await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.id,comparables:comps})})).json();
     if(pj.price){price=pj.price;if(pj.grounded)note='pris tjekket mod '+comps.length+' annoncer'}
    }
   }
  }catch(e){note='prisopslag fejlede'}
 }else if(!d.needsPricing){note='pris allerede markedstjekket'}

 // Felterne først, billederne til sidst. Fotouploaden tegner formularen om,
 // mens den kører, og en vælger, der bliver skiftet ud midt i et klik, åbner
 // ikke — så de to ting må ikke overlappe.
 var mangler=[];

 // Kategorien først: resten af felterne findes ikke uden den.
 var catFail=await fillCategory(d.categoryPath);
 log('kategori: '+(catFail||'ok'));
 if(catFail){
  mangler.push('kategori','mærke','størrelse','stand','farve');
 }else{
  var steps=[
   ['mærke',fillBrand,[d.brand]],
   ['størrelse',fillSize,[d.size,d.sizeScale]],
   ['stand',fillPick,['condition',d.condition,'stand']],
   ['farve',fillPick,['color',d.color,'farve']],
   ['materiale',fillPick,['material',d.material,'materiale']]
  ];
  for(var si=0;si<steps.length;si++){
   var miss=await steps[si][1].apply(null,steps[si][2]);
   log(steps[si][0]+': '+(miss||'ok'));
   if(miss)mangler.push(miss);
  }
 }

 // Teksten til sidst, så ingen dialog kan nå at rydde den. Felterne slås op
 // igen her: React har tegnet formularen om, siden vi startede, og de gamle
 // knuder sidder ikke længere i siden.
 var t2=q('#title'),de2=q('#description'),pe2=q('#price');
 if(t2)setv(t2,d.title);
 if(de2)setv(de2,d.description);
 if(pe2)setv(pe2,price);
 log('tekst sat');

 // Til sidst billederne. Uploaden kører videre af sig selv herfra.
 log('billeder: '+(d.photos||[]).length);
 if(await fillPhotos(d.photos))mangler.push('billeder');
 log('billeder klar');

 alert('Udfyldt: '+d.title+'\n'+note+'.\n\n'+
  (mangler.length?'Sæt selv: '+mangler.join(', ')+'.\n\n':'Alle felter og billeder er sat.\n\n')+
  'Tjek annoncen igennem og tryk Upload.');
}catch(e){alert('Udbakke-fejl: '+e.message)}
})();
`;
