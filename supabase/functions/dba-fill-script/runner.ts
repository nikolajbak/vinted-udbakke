// Det, brugerscriptet kører på DBA's opret-side. Samme opbygning som
// Vinted-runneren, men DBA's formular er en anden slags dyr.
//
// DBA kører på Schibsteds FINN-platform, og hele formularen er tegnet med
// Warp-webkomponenter. Det har tre følger, som alle er målt på siden selv:
//
//  1. Felterne ligger i shadow DOM. document.querySelector finder ingenting —
//     opslaget skal gå gennem hver shadow-rod undervejs.
//  2. Felterne kan ikke peges på. Hvert eneste tekstfelt har id "textfield",
//     hver vælger "select_id", og kun overskriften har et name. Derfor findes
//     feltet på den ETIKET, der står ved siden af det.
//  3. Begivenheder skal være composed. Uden det slipper de ikke ud af
//     shadow-roden, komponenten opdager aldrig ændringen, og DBA gemmer intet
//     — mens feltet på skærmen ser fuldstændig rigtigt ud.
//
// Skrevet uden template literals: teksten lægges selv i en nedenfor.
export const RUNNER = String.raw`
(async function(){
if(window.__UDBAKKE_DBA_RAN__)return;
window.__UDBAKKE_DBA_RAN__=true;

var API=window.__UDBAKKE_DBA_API__;
var AUTO=!!window.__UDBAKKE_DBA_AUTO__;
var DRAFT_ID=null;
var LOG=window.__UDBAKKE_DBA_LOG__=[];
function log(s){LOG.push(Math.round(performance.now()/100)/10+'s '+s)}

function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function norm(s){return (s||'').replace(/\s+/g,' ').trim().toLowerCase()}

function timedFetch(url,opts,ms){
 var c=new AbortController();
 var timer=setTimeout(function(){c.abort()},ms||25000);
 return fetch(url,Object.assign({},opts||{},{signal:c.signal}))
  .finally(function(){clearTimeout(timer)});
}

// Opslag der gaar gennem shadow-roedder. Hele DBA's formular ligger inde i
// dem, saa dette er bunden af alt herunder.
function deep(sel){
 var out=[];
 (function go(root){
  try{Array.prototype.push.apply(out,root.querySelectorAll(sel))}catch(e){}
  Array.prototype.forEach.call(root.querySelectorAll('*'),function(e){
   if(e.shadowRoot)go(e.shadowRoot);
  });
 })(document);
 return out;
}

// Feltet findes paa sin etiket. Enten baerer vaerten den selv (Pris,
// Postnummer har label="..."), ellers staar den som foerste barn i en af
// forfaedrene — og vejen op gaar baade gennem almindelige foraeldre og
// gennem shadow-vaerter, ellers stopper klatringen ved den foerste rod.
function fieldFor(label){
 var n=norm(label),c=deep('input,select,textarea');
 for(var i=0;i<c.length;i++){
  var e=c[i],h=e.getRootNode().host;
  if(h&&norm(h.getAttribute('label'))===n)return e;
  var p=h||e;
  for(var k=0;k<7&&p;k++){
   var f=p.firstElementChild;
   if(f&&norm(f.textContent).indexOf(n)===0)return e;
   p=p.parentElement||(p.getRootNode()&&p.getRootNode().host);
  }
 }
 return null;
}

// composed:true er ikke til pynt. Uden den naar begivenheden aldrig ud af
// shadow-roden, og aendringen bliver aldrig gemt.
function fire(el,type,Ctor){
 el.dispatchEvent(new (Ctor||Event)(type,{bubbles:true,composed:true}));
}
function nativeSet(el,v){
 var p=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(p,'value').set.call(el,v);
}

function optionsOf(el){
 return Array.prototype.slice.call(el.options||[])
  .map(function(o){return{v:o.value,t:(o.textContent||'').replace(/\s+/g,' ').trim()}})
  .filter(function(o){return o.v&&o.t});
}
function setSelect(el,v){el.value=v;fire(el,'input');fire(el,'change')}
function setText(el,v){nativeSet(el,v);fire(el,'input');fire(el,'change')}

// Stoerrelse, maerke og materiale er comboboxer. De gemmer foerst, naar
// feltet forlades — et "input" alene saetter teksten paa skaermen og intet
// andet. DBA slaar selv teksten op og gemmer sit eget nummer for den.
function setCombo(el,v){
 nativeSet(el,v);
 fire(el,'input');fire(el,'change');fire(el,'focusout',FocusEvent);
}

// DBA's ordlyd er deres egen — "Brugt - men i god stand", ikke "God". Eget
// gaet foerst, saa det billige tilfaelde er gratis; ellers spoerger vi.
async function choose(kind,valgt,opts,hint){
 if(hint){
  var n=norm(hint);
  var m=opts.filter(function(o){return norm(o.t)===n});
  if(!m.length)m=opts.filter(function(o){return norm(o.t).indexOf(n)===0});
  if(m.length)return m[0];
 }
 try{
  var r=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:DRAFT_ID,mode:'choose',kind:kind,chosen:valgt,hint:hint,
    options:opts.map(function(o){return o.t})})},30000);
  var j=await r.json();
  return (j.index>=0&&j.index<opts.length)?opts[j.index]:null;
 }catch(e){return null}
}

async function ventPaaFelt(label,ms){
 var slut=Date.now()+(ms||5000);
 while(Date.now()<slut){
  var e=fieldFor(label);
  if(e&&optionsOf(e).length)return e;
  if(e&&e.tagName!=='SELECT')return e;
  await sleep(250);
 }
 return fieldFor(label);
}

// Kategorien er tre vaelgere, der haenger sammen: underkategorien fyldes
// foerst, naar hovedkategorien er valgt, og produktkategorien foerst efter
// den. Derfor slaas feltet op paa ny for hvert trin, og der ventes paa, at
// mulighederne faktisk er kommet.
async function fillCategory(path){
 var trin=['Hovedkategori','Underkategori','Produktkategori'],valgt=[];
 for(var i=0;i<trin.length;i++){
  var el=await ventPaaFelt(trin[i],8000);
  if(!el){log(trin[i]+': feltet kom aldrig');break}
  var opts=optionsOf(el);
  if(!opts.length){log(trin[i]+': ingen muligheder');break}
  var t=await choose('kategori',valgt,opts,path&&path[i]);
  if(!t){log(trin[i]+': intet valg');break}
  setSelect(el,t.v);valgt.push(t.t);
  log(trin[i]+': '+t.t);
  await sleep(1400);
 }
 return valgt.length===3?null:'kategori';
}

async function fillSelect(label,kind,value,fallback){
 var el=await ventPaaFelt(label,6000);
 if(!el)return label.toLowerCase();
 var opts=optionsOf(el);
 if(!opts.length)return label.toLowerCase();
 var t=await choose(kind,[],opts,value);
 if(!t&&fallback){
  t=opts.filter(function(o){return norm(o.t)===norm(fallback)})[0]||null;
 }
 if(!t)return label.toLowerCase();
 setSelect(el,t.v);
 log(label+': '+t.t);
 await sleep(700);
 return null;
}

async function fillCombo(label,value){
 if(!value)return null;
 var el=fieldFor(label);
 if(!el)return label.toLowerCase();
 setCombo(el,value);
 await sleep(1200);
 log(label+': '+value);
 return el.value?null:label.toLowerCase();
}

// DBA laeser filerne af selve input-feltet, og det ligger til gengaeld i den
// almindelige DOM. Samme greb som paa Vinted: en side maa ikke AABNE
// filvaelgeren, men den maa godt laegge filer i feltet og sige til.
async function fillPhotos(urls){
 if(!urls||!urls.length)return 'billeder';
 var inp=deep('input[type=file]')[0];
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
 fire(inp,'change');
 await sleep(2000);
 return null;
}

function say(msg){
 if(!AUTO){alert(msg);return}
 var el=document.createElement('div');
 el.textContent=msg;
 el.setAttribute('style','position:fixed;left:12px;right:12px;bottom:16px;z-index:2147483647;'+
  'background:#1b6f4a;color:#fff;font:600 15px/1.4 -apple-system,system-ui,sans-serif;'+
  'padding:14px 16px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.28);white-space:pre-line');
 document.body.appendChild(el);
 setTimeout(function(){el.style.transition='opacity .4s';el.style.opacity='0';
  setTimeout(function(){el.remove()},500)},7000);
}

async function waitForm(){
 for(var i=0;i<80;i++){
  if(fieldFor('Hovedkategori')&&fieldFor('Annonceoverskrift'))return true;
  await sleep(250);
 }
 return false;
}

if(!/\/recommerce\/create\//.test(location.pathname)){
 if(!AUTO)alert('VintedAuto: du er ikke på DBAs opret-side. Gå til DBA → Ny annonce → Markedspladsen, og prøv igen.');
 return;
}
if(!await waitForm()){
 if(!AUTO)alert('VintedAuto: formularen kom aldrig frem.');
 return;
}

try{
 var d=await(await timedFetch(API+(AUTO?'&auto=1':''),{},25000)).json();
 if(d.empty){if(!AUTO)alert('VintedAuto: ingen klar udkast i køen.');return}
 DRAFT_ID=d.id;
 var mangler=[];

 // Kategorien foerst. DBA's oevrige felter afhaenger af den — maerkefeltet
 // hedder bogstaveligt talt "children_clothing_brand", naar kategorien er
 // boernetoej — saa de skal slaas op EFTER, den er sat.
 var catFail=await fillCategory(d.categoryPath);
 log('kategori: '+(catFail||'ok'));
 if(catFail)mangler.push('kategori');

 var trin=[
  ['Størrelse',null,d.size],
  ['Mærke',null,d.brand],
  ['Materiale',null,d.material]
 ];
 for(var i=0;i<trin.length;i++){
  var m=await fillCombo(trin[i][0],trin[i][2]);
  if(m)mangler.push(m);
 }

 var vaelg=[
  ['Stand','stand',d.condition,null],
  ['Farve','farve',d.color,null],
  ['Køn','køn',d.gender,'Unisex'],
  // Pasform findes ikke i vores egne data. "Normal i størrelsen" er det
  // sande svar for langt de fleste varer og et aerligt udgangspunkt.
  ['Pasform','pasform',null,'Normal i størrelsen']
 ];
 for(var j=0;j<vaelg.length;j++){
  var mm=await fillSelect(vaelg[j][0],vaelg[j][1],vaelg[j][2],vaelg[j][3]);
  if(mm)mangler.push(mm);
 }

 // Teksten til sidst, saa ingen omtegning kan naa at rydde den.
 var t=fieldFor('Annonceoverskrift'),b=fieldFor('Beskrivelse'),p=fieldFor('Pris');
 if(t)setText(t,d.title);
 if(b)setText(b,d.description);
 if(p&&d.price)setText(p,d.price);
 log('tekst sat');

 log('billeder: '+(d.photos||[]).length);
 if(await fillPhotos(d.photos))mangler.push('billeder');
 log('billeder klar');

 if(AUTO){try{await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({id:DRAFT_ID,mode:'clear'})},15000)}catch(e){}}

 say('Udfyldt på DBA: '+d.title+'\n'+
  (mangler.length?'Sæt selv: '+mangler.join(', ')+'.':'Alle felter og billeder er sat.')+
  '\nTjek annoncen igennem og tryk Opret annonce.');
}catch(e){say('VintedAuto-fejl: '+e.message)}
})();
`;
