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
// Prisen blev ikke gemt uden focusout, selv om titel og beskrivelse blev.
function setText(el,v){nativeSet(el,v);fire(el,'input');fire(el,'change');fire(el,'focusout',FocusEvent)}

// Stoerrelse, maerke og materiale er comboboxer, og de kan IKKE fyldes ved at
// saette en vaerdi. Komponenten aabner foerst sin forslagsliste, naar der
// kommer rigtige tastetryk — et programmeret "input" alene efterlader den
// lukket, og saa er der intet at gemme. Feltet staar rigtigt paa skaermen
// imens, og serveren gemmer ingenting. Maalt: uden det her blev maerke,
// stoerrelse og materiale tomme i tre proevekoersler i traek.
//
// Opskriften er: tast tegn for tegn, vent paa listen, og vaelg med
// piletast + retur. Et klik paa forslaget virker IKKE.
async function setCombo(el,v){
 var proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
 var set=Object.getOwnPropertyDescriptor(proto,'value').set;
 el.focus();
 set.call(el,'');
 el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true}));
 await sleep(300);
 for(var i=0;i<v.length;i++){
  set.call(el,v.slice(0,i+1));
  el.dispatchEvent(new KeyboardEvent('keydown',{key:v[i],bubbles:true,composed:true}));
  el.dispatchEvent(new InputEvent('input',{data:v[i],inputType:'insertText',bubbles:true,composed:true}));
  el.dispatchEvent(new KeyboardEvent('keyup',{key:v[i],bubbles:true,composed:true}));
  await sleep(110);
 }
 await sleep(1400);
 ['ArrowDown','Enter'].forEach(function(k){
  el.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,composed:true}));
  el.dispatchEvent(new KeyboardEvent('keyup',{key:k,bubbles:true,composed:true}));
 });
 await sleep(900);
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
var VALGT_STI=[];
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
 VALGT_STI=valgt.slice();
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
 await setCombo(el,value);
 log(label+': '+value+(el.value?'':' (tom bagefter)'));
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

// ---- Markedsanalyse paa DBA ---------------------------------------------
// Prisen paa udkastet er sat ud fra VINTED. DBA er et andet marked med andre
// koebere, og for boernetoej ligger det maerkbart hoejere - CeLaVi-regnjakker
// laa paa 50-100 kr paa DBA, hvor Vinted-skoennet sagde 35. Derfor slaas
// markedet op paa DBA selv, fra din egen session.
//
// Ligesom paa Vinted gaelder det, at det man KAN se, er dét der endnu ikke er
// solgt. Feltet skaevvrider opad, og prisen skal derfor lande paa eller under
// medianen af de sammenlignelige.

function parsePris(t){
 var m=(t||'').match(/^\s*([\d.]+)\s*kr/i);
 if(!m)return 0;
 return parseInt(m[1].replace(/\./g,''),10)||0;
}

// DBA's soegeside er almindelig HTML. Kortene har prisen foerst og derefter
// titel, stoerrelse, maerke og by i én stroem - den laeser modellen fint, og
// vi skal kun bruge tallet selv til regnestykket.
async function soeg(q){
 try{
  var r=await timedFetch('/recommerce/forsale/search?q='+encodeURIComponent(q),
   {credentials:'include'},20000);
  if(!r.ok)return [];
  var doc=new DOMParser().parseFromString(await r.text(),'text/html');
  var set={},ud=[];
  Array.prototype.forEach.call(doc.querySelectorAll('a[href*="/recommerce/forsale/item/"]'),function(a){
   var id=(a.getAttribute('href')||'').match(/item\/(\d+)/);
   if(!id||set[id[1]])return;
   var card=a;
   for(var k=0;k<6&&card;k++){card=card.parentElement;
    if(card&&/\d[\d.]*\s*kr/i.test(card.textContent||''))break}
   var t=(card?card.textContent:'').replace(/\s+/g,' ').trim();
   var pris=parsePris(t);
   if(!pris)return;
   set[id[1]]=1;
   ud.push({id:id[1],price:pris,text:t.slice(0,150)});
  });
  return ud;
 }catch(e){return []}
}

async function markedsanalyse(d,sti){
 // Grundlaget bygges i trin, fra det praeciseste og udad. Maerket foerst:
 // en CeLaVi-regnjakke er den bedste maalestok for en anden CeLaVi-regnjakke.
 // Men er der faa af maerket - eller slet ingen - siger de faa priser mere om
 // tilfaeldigheder end om markedet. Saa udvides der til KATEGORIEN, og
 // modellen faar at vide, hvad den kigger paa, saa den kan regne maerkets
 // placering ind i stedet for at behandle det hele som ét felt.
 var leaf=(sti&&sti[2])||((d.categoryPath&&d.categoryPath.length)?d.categoryPath[d.categoryPath.length-1]:'');
 var mid=(sti&&sti[1])||'';
 var set={},maerke=[],kategori=[];

 async function saml(q,bunke,tier){
  if(!q)return;
  var r=await soeg(q);
  r.forEach(function(i){
   if(set[i.id])return;
   set[i.id]=1;i.tier=tier;bunke.push(i);
  });
 }

 // Trin 1-2: maerket.
 if(d.brand){
  await saml([d.brand,leaf].filter(Boolean).join(' '),maerke,'mærke');
  if(maerke.length<8&&mid)await saml([d.brand,mid].filter(Boolean).join(' '),maerke,'mærke');
 }

 // Trin 3-5: kategorien. Koeres naar maerket ikke gav nok - og ogsaa naar
 // varen slet intet maerke har.
 var NOK=12;
 if(maerke.length<8){
  await saml([leaf,d.size].filter(Boolean).join(' '),kategori,'kategori');
  if(maerke.length+kategori.length<NOK)await saml(leaf,kategori,'kategori');
  if(maerke.length+kategori.length<NOK&&mid)
   await saml([mid,d.size].filter(Boolean).join(' '),kategori,'kategori');
 }

 var alle=maerke.concat(kategori);
 if(alle.length<4){log('marked: kun '+alle.length+' annoncer, beholder skoennet');return null}
 log('marked: '+alle.length+' annoncer ('+maerke.length+' af maerket, '+kategori.length+' fra kategorien)');
 try{
  var r2=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:DRAFT_ID,mode:'market',items:alle.slice(0,60),
    maerkeAntal:maerke.length,kategoriNavn:leaf||mid})},60000);
  var j=await r2.json();
  if(j&&(j.price||j.description)){log('marked: '+(j.note||'sat'));return j}
 }catch(e){log('marked: opslaget fejlede')}
 return null;
}

// Billedteksterne findes foerst, naar billederne er lagt ind - der er ét felt
// pr. billede, i samme raekkefoelge som de blev uploadet.
async function fillCaptions(tekster){
 if(!tekster||!tekster.length)return null;
 var felter=[];
 for(var forsoeg=0;forsoeg<20;forsoeg++){
  felter=deep('textarea').filter(function(e){return e.placeholder==='Billedtekst'});
  if(felter.length)break;
  await sleep(500);
 }
 if(!felter.length)return 'billedtekster';
 var n=Math.min(felter.length,tekster.length);
 for(var i=0;i<n;i++){
  if(!tekster[i])continue;
  setText(felter[i],tekster[i]);
  FORVENTET.tekster.push(tekster[i]);
  await sleep(350);
 }
 log('billedtekster: '+n+' af '+felter.length);
 return null;
}

// ---- Kontrol mod serveren -------------------------------------------------
// DOM'en lyver: tre felter saa udfyldte ud og var tomme, da de blev laest
// tilbage. Her er spoergsmaalet et andet end om noget staar paa skaermen —
// gemmer DBA pris og billedtekster, naar man trykker Fortsaet? De to felter er
// ikke med i den PUT, trin 1 sender, saa enten commits de ved trinskiftet,
// eller ogsaa gaar de tabt.
//
// To instrumenter svarer paa det:
//  1. Vi lytter paa sidens EGNE kald og ser, hvad trinskiftets PUT bar med sig.
//  2. Vi laeser annoncen tilbage fra serveren bagefter. Det er facit.

var FORVENTET={pris:null,tekster:[]};
var FAERDIG=false,kontrolTimer=null,sidsteSvar='';

function itemId(){
 var m=location.pathname.match(/\/recommerce\/create\/([^\/?#]+)/);
 return m?m[1]:null;
}

async function laesServer(){
 var id=itemId();
 if(!id)return null;
 try{
  var r=await timedFetch('/recommerce/create/api/item/'+id,{credentials:'include',cache:'no-store'},15000);
  if(!r.ok){log('kontrol: serveren svarede '+r.status);return null}
  return await r.json();
 }catch(e){return null}
}

// Vi leder efter VAERDIEN, ikke efter et feltnavn vi har gaettet. Saa svarer
// kontrollen ogsaa, hvis DBA kalder prisen noget andet end vi tror — og den
// fortaeller os til gengaeld, hvad feltet saa hedder.
function stier(obj,vaerdi,sti,ud){
 ud=ud||[];sti=sti||'';
 if(obj===null||obj===undefined)return ud;
 if(typeof obj==='object'){
  Object.keys(obj).forEach(function(k){stier(obj[k],vaerdi,sti?sti+'.'+k:k,ud)});
  return ud;
 }
 if(norm(vaerdi)&&norm(String(obj))===norm(String(vaerdi)))ud.push(sti||'(rod)');
 return ud;
}

async function kontroller(naar){
 var s=await laesServer();
 if(!s){log('kontrol ('+naar+'): kunne ikke laese annoncen tilbage');return null}
 var pris=[];
 if(FORVENTET.pris){
  pris=stier(s,FORVENTET.pris);
  // Prisen kan ligge i oere. Samme tal, anden enhed, og saa ville den ellers
  // blive meldt tabt, mens den er gemt.
  if(!pris.length)pris=stier(s,String(Number(FORVENTET.pris)*100));
 }
 var fundet=0,hvor='';
 for(var i=0;i<FORVENTET.tekster.length;i++){
  var f=stier(s,FORVENTET.tekster[i]);
  if(f.length){fundet++;if(!hvor)hvor=f[0]}
 }
 var svar='pris '+(FORVENTET.pris?(pris.length?'GEMT i '+pris.join(', '):'IKKE gemt'):'ikke sat')+
  ' · billedtekster '+fundet+' af '+FORVENTET.tekster.length+(hvor?' (fx '+hvor+')':'');
 log('kontrol ('+naar+'): '+svar);
 return {tekst:svar,pris:pris.length>0,tekster:fundet};
}

function meld(k){
 if(!k)return;
 var alt=(!FORVENTET.pris||k.pris)&&k.tekster===FORVENTET.tekster.length;
 banner('Kontrol mod DBAs server\n'+k.tekst,alt?'#1b6f4a':'#7a3b1f');
}

// Sidens eget kald er startskuddet: naar DBA selv har sendt noget, er der noget
// nyt at laese tilbage. Halvandet sekunds luft, saa serveren er faerdig.
function efterKald(){
 if(!FAERDIG)return;
 clearTimeout(kontrolTimer);
 kontrolTimer=setTimeout(function(){
  kontroller('efter sidens eget kald').then(function(k){
   if(!k||k.tekst===sidsteSvar)return;
   sidsteSvar=k.tekst;
   meld(k);
  });
 },1500);
}

function noterKald(metode,adresse,krop){
 var u=String(adresse||'');
 if(u.indexOf('/recommerce/create/api/')<0)return;
 var m=String(metode||'GET').toUpperCase();
 if(m==='GET')return;
 var bar=[];
 if(typeof krop==='string'&&krop){
  if(FORVENTET.pris&&krop.indexOf(FORVENTET.pris)>-1)bar.push('pris');
  var n=0;
  for(var i=0;i<FORVENTET.tekster.length;i++)if(krop.indexOf(FORVENTET.tekster[i])>-1)n++;
  if(n)bar.push(n+' billedtekster');
 }
 log('sidens kald: '+m+' '+u.split('?')[0]+' — indeholdt '+
  (bar.length?bar.join(' + '):'hverken pris eller billedtekster'));
 efterKald();
}

// Wrappet skal ligge FOER siden sender noget. @inject-into page goer det
// muligt: koerte scriptet i sin egen verden, ville sidens fetch vaere en anden
// end vores, og vi ville ikke se et eneste kald.
function spion(){
 var oFetch=window.fetch;
 window.fetch=function(input,init){
  try{
   var u=typeof input==='string'?input:(input&&input.url)||'';
   var m=(init&&init.method)||(input&&input.method)||'GET';
   noterKald(m,u,init&&typeof init.body==='string'?init.body:null);
  }catch(e){}
  return oFetch.apply(this||window,arguments);
 };
 var X=window.XMLHttpRequest.prototype,oOpen=X.open,oSend=X.send;
 X.open=function(m,u){try{this.__um=m;this.__uu=u}catch(e){}return oOpen.apply(this,arguments)};
 X.send=function(b){
  try{noterKald(this.__um,this.__uu,typeof b==='string'?b:null)}catch(e){}
  return oSend.apply(this,arguments);
 };
}

// Navigerer siden ved Fortsaet, doer lytteren med den. Derfor laegges det
// forventede i sessionStorage, som overlever et sideskift i samme faneblad:
// saa kan naeste koersel paa samme annonce svare i stedet for os.
function gemForventet(){
 try{sessionStorage.setItem('udbakke-dba-forventet',JSON.stringify({id:itemId(),f:FORVENTET}))}catch(e){}
}
function hentForventet(){
 try{
  var g=JSON.parse(sessionStorage.getItem('udbakke-dba-forventet')||'null');
  if(g&&g.id&&g.id===itemId()&&g.f&&g.f.tekster)return g.f;
 }catch(e){}
 return null;
}

// Kontrollen melder sig laenge efter, at fyldningen er forbi, og den maa
// aldrig blokere siden. Derfor har den sin egen banner - alert er kun til den
// besked, man staar og venter paa.
function banner(msg,farve){
 var el=document.createElement('div');
 el.textContent=msg;
 el.setAttribute('style','position:fixed;left:12px;right:12px;bottom:16px;z-index:2147483647;'+
  'background:'+(farve||'#1b6f4a')+';color:#fff;font:600 15px/1.4 -apple-system,system-ui,sans-serif;'+
  'padding:14px 16px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.28);white-space:pre-line');
 document.body.appendChild(el);
 setTimeout(function(){el.style.transition='opacity .4s';el.style.opacity='0';
  setTimeout(function(){el.remove()},500)},7000);
}
function say(msg){
 if(!AUTO){alert(msg);return}
 banner(msg);
}

async function waitForm(){
 for(var i=0;i<80;i++){
  if(fieldFor('Hovedkategori')&&fieldFor('Annonceoverskrift'))return true;
  await sleep(250);
 }
 return false;
}

// Appen sender dig til /create-item/start, og dér FINDES opret-formularen ikke
// endnu: DBA vil foerst vide, hvilken slags annonce det er. Uden det her staar
// man paa "Ny annonce" og venter paa felter, der aldrig kommer - det ligner, at
// appen er gaaet i staa.
async function startNyAnnonce(){
 for(var i=0;i<24;i++){
  var f=deep('form').filter(function(x){
   return /ad-insertion-frontpage/.test(x.getAttribute('action')||'') &&
          x.querySelector('input[name="adType"][value="recommerce"]');
  })[0];
  if(f){
   log('vaelger Markedspladsen');
   // requestSubmit foerst, saa sidens egen handler faar lov at koere med.
   if(f.requestSubmit)f.requestSubmit(); else f.submit();
   return true;
  }
  await sleep(250);
 }
 return false;
}

if(/\/create-item\//.test(location.pathname)){
 // Kun naar der faktisk venter et udkast. Ellers ville en tilfaeldig tur forbi
 // "Ny annonce" oprette en kladde af sig selv.
 var venter=null;
 try{ venter=await(await timedFetch(API+(AUTO?'&auto=1':''),{},25000)).json(); }catch(e){ return; }
 if(!venter||venter.empty){
  if(!AUTO)alert('VintedAuto: ingen klar udkast i køen. Tryk "Udfyld i DBA" i appen først.');
  return;
 }
 if(!await startNyAnnonce()&&!AUTO){
  alert('VintedAuto: kunne ikke vælge Markedspladsen. Tryk selv på den, så fortsætter automatikken.');
 }
 return;
}

if(!/\/recommerce\/create\//.test(location.pathname)){
 if(!AUTO)alert('VintedAuto: du er ikke på DBAs opret-side. Gå til DBA → Ny annonce → Markedspladsen, og prøv igen.');
 return;
}
spion();

// Har en tidligere koersel fyldt denne annonce ud, er vi her efter et
// trinskifte, ikke for at udfylde igen. Saa er der intet at gaette paa: laes
// annoncen tilbage og meld, hvad serveren faktisk har.
var tidligere=hentForventet();
if(tidligere){
 FORVENTET=tidligere;FAERDIG=true;
 try{sessionStorage.removeItem('udbakke-dba-forventet')}catch(e){}
 meld(await kontroller('efter trinskiftet'));
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

 // Markedet slaas op EFTER kategorien: saa kender vi DBA's eget ord for
 // varen ("Overtøj til børn"), og soegningen rammer bedre end Vinteds.
 var bedre={title:null,description:null,captions:null};
 var price=d.price;
 var marked=await markedsanalyse(d,VALGT_STI);
 if(marked){
  if(marked.title)bedre.title=marked.title;
  if(marked.description)bedre.description=marked.description;
  if(marked.captions)bedre.captions=marked.captions;
  if(marked.price)price=String(marked.price);
 }

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
 if(t)setText(t,bedre.title||d.title);
 if(b)setText(b,bedre.description||d.description);
 if(p&&price){setText(p,price);FORVENTET.pris=String(price)}
 log('tekst sat'+(marked?' (markedsjusteret)':''));

 log('billeder: '+(d.photos||[]).length);
 if(await fillPhotos(d.photos))mangler.push('billeder');
 log('billeder klar');

 // Billedteksterne til allersidst: felterne findes foerst, naar billederne
 // ligger der.
 var capFail=await fillCaptions(bedre.captions||d.captions);
 if(capFail)mangler.push(capFail);

 // Grundlinjen: hvad har serveren FOER man trykker Fortsaet? Herfra lytter
 // kontrollen med paa sidens egne kald og melder, hvad trinskiftet gemte.
 await kontroller('lige efter udfyldning');
 FAERDIG=true;
 gemForventet();

 if(AUTO){try{await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({id:DRAFT_ID,mode:'clear'})},15000)}catch(e){}}

 say('Udfyldt på DBA: '+d.title+'\n'+
  (mangler.length?'Sæt selv: '+mangler.join(', ')+'.':'Alle felter og billeder er sat.')+
  '\nTjek annoncen igennem og tryk Fortsaet — saa melder kontrollen, hvad DBA gemte.');
}catch(e){say('VintedAuto-fejl: '+e.message)}
})();
`;
