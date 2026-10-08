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
// Kun én gang pr. sideindlæsning: i automatisk tilstand kan scriptet blive
// sat i gang igen, hver gang Vinted tegner siden om.
// Vagten hed __UDBAKKE_RAN__ til 8. oktober. Et gammelt brugerscript med
// runneren indbagt kører synkront og når den først, og så gav den friske
// runner op: telefonen udfyldte med en runner, der søgte på en adresse, Vinted
// har lukket, og prisen blev aldrig tjekket. Derfor egen vagt — og sætter en
// anden __UDBAKKE_RAN__, er det et gammelt script, og det skal siges.
if(window.__UDBAKKE_RAN2__)return;
window.__UDBAKKE_RAN2__=true;
var ANDEN_RUNNER=!!window.__UDBAKKE_RAN__;
window.__UDBAKKE_RAN__=true;

// r=2: serveren afviser kald fra vinted.dk uden den, så en gammel runner ikke
// kan udfylde eller melde noget (se RUNNER_GEN i index.ts).
var API=window.__UDBAKKE_API__+'&r=2';
// Automatisk tilstand kører uden at blive bedt om det, så den må aldrig
// afbryde med en dialog. Den siger kun til, når der faktisk skete noget.
var AUTO=!!window.__UDBAKKE_AUTO__;
var DRAFT_ID=null;
// Spor hvert trin. Naar noget gaar galt paa telefonen, staar det i
// window.__UDBAKKE_LOG__ i stedet for at vaere usynligt.
var LOG=window.__UDBAKKE_LOG__=[];
function log(s){LOG.push(Math.round(performance.now()/100)/10+'s '+s)}
// Et trin til serverens log. Telefonens konsol kan ikke ses fra Mac'en, og
// uden det kunne ingen sige, hvor nr. 22 strandede. Samme linje to gange i
// traek sendes kun en gang.
var SIDST_SPOR='';
function spor(s,id){
 log(s);
 if(s===SIDST_SPOR)return; SIDST_SPOR=s;
 // Samme vej som de kald, der beviseligt når frem (timedFetch): 8. oktober
 // kom ingen spor fra opret-siden, mens kategorivalgene gjorde.
 try{timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
  body:JSON.stringify({mode:'spor',id:id||null,tekst:location.pathname+' | '+s})},15000).catch(function(e){log('spor fejlede: '+(e&&e.message))})}catch(e){log('spor kastede: '+e.message)}
}

// Skaermen maa ikke slukke, mens runneren arbejder. Slukker iOS skaermen, saetter
// den fanen til at sove, og saa staar udfyldningen eller vagten efter Upload
// stille. Holdes kun i et begraenset tidsrum (vaagen(min)) og slippes, naar
// arbejdet er gjort. Laasen forsvinder, naar fanen skjules, og tages igen, naar
// den vises. Vil Safari ikke give den uden et tryk, tages den ved det foerste.
var LAAS=null,VAAGEN_TIL=0,VAAGEN_SIDST='',VAAGEN_UR=null;
function vaagenMeld(s){if(s!==VAAGEN_SIDST){VAAGEN_SIDST=s;spor('vaagen: '+s)}}
function tagLaas(){
 if(LAAS||document.hidden||Date.now()>=VAAGEN_TIL)return;
 if(!navigator.wakeLock){vaagenMeld('findes ikke i denne browser');return}
 navigator.wakeLock.request('screen').then(function(l){
  if(Date.now()>=VAAGEN_TIL){l.release().catch(function(){});return}
  LAAS=l;vaagenMeld('skaermen holdes taendt');
  l.addEventListener('release',function(){if(LAAS===l)LAAS=null});
 },function(e){
  vaagenMeld('afvist ('+(e&&e.name)+'), venter paa et tryk');
  document.addEventListener('touchend',tagLaas,{once:true,capture:true});
 });
}
function vaagen(min){
 VAAGEN_TIL=Math.max(VAAGEN_TIL,Date.now()+min*60000);
 clearTimeout(VAAGEN_UR);VAAGEN_UR=setTimeout(slip,VAAGEN_TIL-Date.now());
 tagLaas();
}
function slip(){
 VAAGEN_TIL=0;clearTimeout(VAAGEN_UR);
 if(LAAS){var l=LAAS;LAAS=null;l.release().catch(function(){})}
}
document.addEventListener('visibilitychange',function(){if(!document.hidden)tagLaas()});

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

// Vinteds prisfelt er et valutafelt, der læser det indtastede forskelligt
// efter, om det har fokus. Uden fokus formateres teksten som valuta, og på
// redigeringssiden (der står »149,00 kr.«) gav »120« en TOM pris i
// formularen — Gem fejlede med »Pris skal være større end eller lig med 8.0«.
// Med fokus tager det rå tal imod. React lytter på focusin/focusout, og
// el.focus() fyrer ikke, når fanen ikke har fokus. Målt 8. oktober.
function setPris(el,v){
 el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
 setv(el,v);
 el.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
}

// Vinted viser vaelgerne paa to maader. Er vinduet smalt - en telefon - er det
// en dialog midt paa skaermen. Er det bredt, er panelerne indlejrede i siden
// og staar aabne hele tiden; der er intet at "aabne", og maalt paa DOM'en ser
// aabent og lukket fuldstaendig ens ud.
//
// Feltet peger selv paa sit panel: #size har data-testid
// "category-size-single-grid-input", og panelet hedder det samme paa -content.
// Det gaelder alle seks felter, ogsaa kategorien (catalog-select-dropdown).
// Derfor slaas panelet op ud fra feltet frem for at lede efter "en dialog".
var picker = null;

function panelFor(id){
 var el=q('#'+id); if(!el)return null;
 var tid=el.getAttribute('data-testid')||'';
 if(!/-input$/.test(tid))return null;
 var p=document.querySelector('[data-testid="'+tid.replace(/-input$/,'-content')+'"]');
 return (p&&p.offsetHeight>0)?p:null;
}

function modal(){
 var m=document.querySelector('.ReactModal__Content');
 if(m)return m;
 return (picker&&picker.isConnected&&picker.offsetHeight>0)?picker:null;
}

// En dialog midt i skærmen er i vejen, når man ikke selv har bedt om noget.
function say(msg){
 if(!AUTO){alert(msg);return}
 var el=document.createElement('div');
 el.textContent=msg;
 el.setAttribute('style','position:fixed;left:12px;right:12px;bottom:16px;z-index:2147483647;'+
  'background:#09b1ba;color:#fff;font:600 15px/1.4 -apple-system,system-ui,sans-serif;'+
  'padding:14px 16px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.28);white-space:pre-line');
 document.body.appendChild(el);
 setTimeout(function(){el.style.transition='opacity .4s';el.style.opacity='0';
  setTimeout(function(){el.remove()},500)},7000);
}

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
 // Den forrige vaelger maa ikke haenge ved: paa en bred skaerm staar alle
 // panelerne i siden, og modal() ville ellers svare med det forkerte.
 picker=null;
 await closeStray();
 // Feltet kan have sin handler, laenge foer Vinted har hentet de data,
 // dialogen skal vise - saa foerste klik falder tomt til jorden. Derfor bankes
 // der paa med korte mellemrum i stedet for at vente et langt traek ad gangen.
 for(var forsoeg=0;forsoeg<12;forsoeg++){
  var m=document.querySelector('.ReactModal__Content');
  if(m)return m;
  var p0=panelFor(id);
  if(p0){picker=p0;return p0}
  var el=q('#'+id);
  if(!el)return null;
  if(reactReady(el))el.click();
  for(var i=0;i<6;i++){
   m=document.querySelector('.ReactModal__Content');
   if(m)return m;
   var p=panelFor(id);
   if(p){picker=p;return p}
   await sleep(250);
  }
 }
 log(id+': vælgeren åbnede ikke');
 return null;
}

function filled(id){var e=q('#'+id);return !!(e&&norm(e.value))}

// Sidste sikring: passer det, der endte i feltet, overhovedet til varen?
// Kan der ikke spørges, godkendes valget — et tomt felt er værre end et,
// der måske kunne have været mere præcist.
async function verify(kind,value){
 if(!value)return true;
 try{
  var r=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:DRAFT_ID,mode:'verify',kind:kind,value:value})},30000);
  var j=await r.json();
  if(j.ok===false)log(kind+' forkastet: '+value+(j.reason?' ('+j.reason+')':''));
  return j.ok!==false;
 }catch(e){return true}
}

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
async function ask(kind,chosen,opts,hint,avoid){
 try{
  var r=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:DRAFT_ID,mode:'choose',kind:kind,chosen:chosen,hint:hint,avoid:avoid,
    options:opts.map(function(o){return o.t})})},30000);
  var j=await r.json();
  return (j.index>=0&&j.index<opts.length)?opts[j.index].e:null;
 }catch(e){return null}
}

// Eget gæt først — det sparer et opslag, når ordlyden allerede passer.
// Præfiks tæller med: standene har hele forklaringen hængende efter navnet
// ("Tilfredsstillende" + "En hyppigt anvendt artikel med ..."). Korteste
// træffer vinder, så vi rammer selve rækken og ikke noget, der rummer den.
async function choose(root,kind,chosen,label,avoid){
 var opts=options(root,chosen);
 if(!opts.length)return null;

 // Vinted foreslår selv hele stier ud fra titlen, og de rammer ofte bedre end
 // et gæt niveau for niveau. Står der forslag på skærmen, må genvejen herunder
 // ikke nappe det oplagte punkt, før forslagene overhovedet er set — det var
 // sådan en regnjakke endte under vindjakker.
 var harForslag=opts.some(function(o){return o.t.indexOf(' > ')>-1});

 if(label && !harForslag){
  var n=norm(label);
  var hit=opts.filter(function(o){return norm(o.t)===n});
  if(!hit.length)hit=opts.filter(function(o){return norm(o.t).indexOf(n)===0});
  if(hit.length){
   hit.sort(function(a,b){return a.t.length-b.t.length});
   return hit[0].e;
  }
 }
 return await ask(kind,chosen,opts,label,avoid);
}

// Kategorivælgeren skal helt i bund: "Gem" på et mellemniveau kasserer valget,
// mens "Gem" på et blad gemmer det. Bunden kender man på, at der ikke er flere
// punkter at vælge — kun Gem-knappen står tilbage. Så: klik dig ned, til der
// ikke er mere, og gem så. Blev feltet ikke udfyldt, prøves der forfra én gang.
async function categoryOnce(path,avoid){
 var m=await open('category');if(!m)return null;
 var chosen=[];
 for(var i=0;i<8;i++){
  var cur=modal();
  if(!cur)break; // dialogen lukkede = bladet er valgt
  var before=norm(cur.textContent);
  // AI'ens eget forslag prøves først; ellers vælges der blandt Vinteds egne.
  var t=await choose(cur,'kategori',chosen,path&&path[i],avoid);
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
 // Hele stien med tilbage. Bladet alene siger intet om, hvilken gren man kom
 // ned ad — og det er grenen, der afgør, om varen ligger under pigetøj eller
 // drengetøj.
 return filled('category') ? chosen : null;
}

async function fillCategory(path){
 var avoid=[];
 for(var forsoeg=0;forsoeg<2;forsoeg++){
  // Andet forsøg går uden billedanalysens forslag: var det først valg forkert,
  // var forslaget som regel dét, der pegede skævt.
  var sti=await categoryOnce(forsoeg?null:path,avoid);
  if(!sti){
   log('kategori: nåede ikke i bund, prøver igen');
   continue;
  }
  // Hele stien til kontrol, ikke bare bladet: "Regnjakker" er rigtigt uanset
  // gren, så en forkert gren ville aldrig blive fanget.
  var valgt=sti.join(' > ');
  if(await verify('kategori',valgt))return null;
  avoid.push(valgt);
 }
 if(!filled('category'))return 'kategori';
 // Værdien bliver stående — den er bedre end ingenting — men du får besked.
 return avoid.length?'kategori (tjek den)':null;
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
 if(!filled('brand'))return 'mærke';
 return await verify('mærke',q('#brand').value)?null:'mærke (tjek det)';
}

async function fillSize(size,scale){
 if(!size)return null;
 var m=await open('size');if(!m)return 'størrelse';
 if(scale){var c=pick(m,scale);if(c){c.click();await sleep(800)}}
 var t=await choose(modal()||m,'størrelse',[],size);
 if(!t){await closeStray();return 'størrelse'}
 t.click();await sleep(800);
 await save();await closeStray();
 if(!filled('size'))return 'størrelse';
 return await verify('størrelse',q('#size').value)?null:'størrelse (tjek den)';
}

async function fillPick(id,label,name){
 if(!label)return null;
 var m=await open(id);if(!m)return name;
 var t=await choose(m,name,[],label);
 if(!t){await closeStray();return name}
 t.click();await sleep(800);
 await save();await closeStray();
 if(!filled(id))return name;
 return await verify(name,q('#'+id).value)?null:name+' (tjek det)';
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

// ---- Markedsanalyse ------------------------------------------------------
// Vinted skjuler solgte varer, så det, man kan se, er dét, der IKKE er blevet
// solgt. Feltet skævvrider derfor opad, og "gennemsnittet af de synlige" er
// systematisk for dyrt. Det er hele grunden til, at prisen skal lægge sig
// under — ikke for at forære varen væk, men for at ramme dér, hvor de solgte
// lå, da de forsvandt.
//
// favourite_count er det eneste engagements-tal, søgningen giver
// (view_count er altid 0). Mange hjerter på en vare, der STADIG ligger der,
// betyder "eftertragtet, men for dyr" — det er et loft, ikke et mål.

// Søgesvaret har ikke længere brand_title/size_title/status. Mærket står i
// item_box.first_line, og second_line er "størrelse · stand" — eller kun
// standen, når varen ikke har en størrelse.
function dkkItems(list){
 return (list||[]).filter(function(i){return i.price&&i.price.currency_code==='DKK'&&+i.price.amount>0})
  .map(function(i){
   var box=i.item_box||{};
   var linje=String(box.second_line||'').split(' · ');
   var stand=linje.length>1?linje.pop():(linje[0]||'');
   return{
    id:i.id, path:i.path||i.url||'', title:i.title,
    price:+i.price.amount, favourites:i.favourite_count||0,
    brand:i.brand_title||box.first_line||'',
    size:i.size_title||(linje.length&&linje[0]!==stand?linje.join(' · '):''),
    condition:i.status||stand
   };
  });
}

// Vinted flyttede søgningen: /api/v2/catalog/items svarer 404 (målt 1.
// oktober), og deres egen katalogside henter fra api.vinted.dk. Den tillader
// kald fra www.vinted.dk med cookies. Fremhævede annoncer (content_source
// "…promoted…") er betalt plads, ikke relevans — de kan være en Zara-jakke i
// en søgning på Ralph Lauren-skjorter — så de sorteres fra. Derfor hentes 96:
// på side 1 kan 36 af 40 være fremhævede.
// 8. oktober om eftermiddagen sendte telefonen ingen markedsrunde i to
// udfyldninger i træk — søgningen fejlede på under et sekund, mens den samme
// søgning virkede fra Mac'en. Fejlen stod kun i telefonens egen log. Nu går
// den til serverens (spor »søgning: …«), og der prøves én gang til: siden kan
// være ved at forny sit login, når runneren starter. SOEG_FEJL er den sidste
// fejl, så slutbeskeden kan sige, hvorfor prisen ikke blev tjekket.
var SOEG_FEJL='';
async function search(text,n){
 for(var forsoeg=1;forsoeg<=2;forsoeg++){
  var fejl;
  try{
   var r=await timedFetch('https://api.vinted.dk/svc-catalogue/items?search_text='+encodeURIComponent(text)+
    '&order=relevance&page=1&per_page=96',
    {headers:{'Accept':'application/json'},credentials:'include'},20000);
   if(r.ok){
    var items=((await r.json()).items||[]).filter(function(i){
     return !/promoted/.test(String(i.content_source||''));
    });
    var ud=dkkItems(items).slice(0,n||40);
    log('søgning »'+text+'«: '+ud.length);
    return ud;
   }
   fejl='status '+r.status;
  }catch(e){fejl=e.message||String(e)}
  SOEG_FEJL=fejl;
  spor('søgning »'+text+'« forsøg '+forsoeg+': '+fejl,DRAFT_ID);
  if(forsoeg<2)await sleep(2500);
 }
 return [];
}

// De bedst modtagne annoncers egne ord. Beskrivelsen står ikke i søgesvaret,
// så siden hentes og teksten trækkes ud. Kun nogle få: hver side er tung at
// hente på en telefon.
async function sampleTexts(items){
 var ud=[];
 // En Vinted-vareside vejer omkring 2 MB. To er en rimelig pris for at se,
 // hvordan de bedst modtagne annoncer er skrevet; seks ville ikke være det.
 // Og på en målt eller langsom forbindelse springes det helt over — teksten
 // bliver god uden, den bliver bare ikke inspireret.
 var net=navigator.connection;
 if(net&&(net.saveData||/2g/.test(net.effectiveType||''))){
  log('marked: springer tekstprøver over (målt forbindelse)');
  return ud;
 }
 for(var i=0;i<items.length&&ud.length<2;i++){
  if(!items[i].path)continue;
  try{
   var r=await timedFetch(items[i].path,{credentials:'include'},12000);
   if(!r.ok)continue;
   var m=(await r.text()).match(/"description":"((?:[^"\\]|\\.){20,900})"/);
   if(!m)continue;
   var txt=m[1].replace(/\\n/g,' ').replace(/\\"/g,'"').replace(/\\u[0-9a-fA-F]{4}/g,'').trim();
   if(txt.length>25)ud.push({price:items[i].price,favourites:items[i].favourites,text:txt.slice(0,600)});
  }catch(e){}
 }
 return ud;
}

// Hvorfor markedsrunden ikke gav en pris — står i slutbeskeden, så en
// foreløbig pris ikke går stille igennem.
var MARKED_FEJL='';
async function markedsanalyse(d){
 var q1=d.searchQuery||d.title||'';
 // To søgninger: én med mærket, én uden. Den første rammer præcist, den anden
 // fanger de varer, en køber ville stille op ved siden af uden at skæve til
 // mærket.
 var blad=(d.categoryPath&&d.categoryPath.length)?d.categoryPath[d.categoryPath.length-1]:'';
 var q2=[blad,d.size].filter(Boolean).join(' ');
 var a=await search(q1,40);
 var b=(q2&&q2!==q1)?await search(q2,40):[];
 var set={},alle=[];
 a.concat(b).forEach(function(i){if(!set[i.id]){set[i.id]=1;alle.push(i)}});
 if(alle.length<4){
  MARKED_FEJL=alle.length?'kun '+alle.length+' sammenlignelige annoncer':'Vinteds søgning svarede ikke ('+(SOEG_FEJL||'ingen annoncer')+')';
  spor('marked: '+MARKED_FEJL+', beholder skønnet',DRAFT_ID);
  return null;
 }

 var top=alle.slice().sort(function(x,y){return y.favourites-x.favourites});
 var samples=await sampleTexts(top);
 log('marked: '+alle.length+' annoncer, '+samples.length+' tekstprøver');

 // 90 s: mangler en ny vare sin nypris, slår serveren den op først (~10-20 s).
 try{
  var r=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:DRAFT_ID,mode:'market',items:alle,samples:samples})},90000);
  var j=await r.json();
  if(j&&j.price){log('marked: '+(j.note||'pris sat'));return j}
  MARKED_FEJL='serveren gav ingen pris'+(j&&j.error?' ('+String(j.error).slice(0,80)+')':'');
 }catch(e){MARKED_FEJL='opslaget fejlede ('+(e.message||e)+')'}
 spor('marked: '+MARKED_FEJL,DRAFT_ID);
 return null;
}

// Markedsanalysen skriver titel og beskrivelse om. De lægges her og sættes
// ind til sidst, sammen med prisen.
var bedre={title:null,description:null};

/* ---- Prisvagt -----------------------------------------------------------
   Serveren husker, hvad der ligger ude, og beslutter hvad det skal koste. Men
   den kan hverken se Vinted eller skrive i Vinteds formular — det kan kun din
   egen session. Så her er telefonens halvdel: mål varen, mål feltet, og sæt
   den nye pris ind, når du har bedt om det.

   At MÅLE sker stille, når der alligevel er en annonceside åben. At ÆNDRE en
   pris sker kun, når du selv har trykket på Prisvagt i appen — en pris på et
   rigtigt marked er ikke noget, et script skal rette i forbifarten. */

var VAGT_KOE='udbakke_prisvagt_koe';
var VAGT_SIDST='udbakke_prisvagt_sidst';

function koeLaes(){
 try{
  var r=JSON.parse(localStorage.getItem(VAGT_KOE)||'null');
  if(!r||!r.tid||(Date.now()-r.tid)>7200000)return null;
  return r;
 }catch(e){return null}
}
function koeSkriv(k){
 try{
  if(k&&k.poster&&k.poster.length)localStorage.setItem(VAGT_KOE,JSON.stringify(k));
  else localStorage.removeItem(VAGT_KOE);
 }catch(e){}
}

// Fanen blev åbnet af appen, når adressen bar et udbakke-flag (vagt, synk,
// ret, send). Det huskes for FANEN: flaget er væk, så snart Vinted skifter
// side, og en fane, du selv har åbnet, skal aldrig lukke under dig.
var FRA_APP='udbakke_fra_app';
function fraApp(){
 try{
  if(/[?&#]udbakke=/.test(location.search+location.hash))sessionStorage.setItem(FRA_APP,'1');
  return sessionStorage.getItem(FRA_APP)==='1';
 }catch(e){return false}
}
// Færdig, og intet venter på dig: luk fanen. Safari lader ikke en side lukke
// en fane, den ikke selv har åbnet, så det gør brugerscriptet »Udbakke luk«
// (GM.closeTab — kun muligt i udvidelsens eget rum, mens runneren skal køre i
// sidens for at nå Reacts data). Det sætter data-udbakke-luk på <html> og
// lytter efter 'udbakke-luk'. Uden det står båndet med en knap til at
// installere det. Tilbage til appen kan en side ikke sende dig: iOS' »◀«
// øverst til venstre gør det.
function lukFanen(tekst){
 slip();
 if(!fraApp()){baand(tekst,null,null);return}
 try{sessionStorage.removeItem(FRA_APP)}catch(e){}
 var kan=function(){return document.documentElement.hasAttribute('data-udbakke-luk')};
 spor('luk: '+tekst+(kan()?'':' (uden Udbakke luk)'));
 var b=baand(tekst+' Lukker fanen …',null,null);
 setTimeout(function(){
  if(kan())document.dispatchEvent(new CustomEvent('udbakke-luk'));
  else{try{window.close()}catch(e){}}
  setTimeout(function(){
   if(b)b.remove();
   if(kan())baand(tekst+' Luk fanen, og gå tilbage til appen.',null,null);
   else baand(tekst+' Luk fanen, og gå tilbage til appen.','Luk selv næste gang',function(){
    location.href=API.replace('?key=','/udbakke-luk.user.js?key=');
   });
  },1500);
 },2500);
}

// En lille linje øverst i stedet for en alert. Prisvagten kører uopfordret, og
// noget uopfordret må ikke spærre siden.
function baand(tekst,knap,virk){
 var b=document.createElement('div');
 b.setAttribute('style','position:fixed;left:0;right:0;top:0;z-index:2147483647;'+
  'background:#16324a;color:#fff;font:14px/1.4 -apple-system,system-ui,sans-serif;'+
  'padding:10px 14px;display:flex;gap:12px;align-items:center;justify-content:center;'+
  'box-shadow:0 2px 10px rgba(0,0,0,.25)');
 var t=document.createElement('span');t.textContent=tekst;b.appendChild(t);
 if(knap){
  var k=document.createElement('button');
  k.type='button';k.textContent=knap;
  k.setAttribute('style','background:#fff;color:#16324a;border:0;border-radius:6px;'+
   'padding:6px 12px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer');
  k.addEventListener('click',function(){b.remove();virk()});
  b.appendChild(k);
 }
 var x=document.createElement('button');
 x.type='button';x.textContent='×';
 x.setAttribute('style','background:none;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer');
 x.addEventListener('click',function(){b.remove()});
 b.appendChild(x);
 document.body.appendChild(b);
 return b;
}

// Hvad koster varen lige nu, hvor mange har hjertet den, og findes den
// overhovedet stadig? Vinteds eget API først, annoncens side som reserve.
// Hvilken af de to der svarede, står i loggen — så er det målt næste gang i
// stedet for gættet.
// Første nøgle, der findes, vinder. Vinted har skiftet navn på felter før, og
// et opslag, der kun kender ét navn, fejler stille: feltet står bare tomt, og
// det ligner en vare uden titel.
function plukk(o,navne){
 for(var i=0;i<navne.length;i++){
  var v=o[navne[i]];
  if(v===undefined||v===null||v==='')continue;
  if(typeof v==='object')v=v.title||v.name||v.amount||v.code;
  if(v!==undefined&&v!==null&&v!=='')return v;
 }
 return null;
}

// Hele kroner ud af en pristekst. Staar komma og punktum begge, er det sidste
// decimaltegnet; staar kun det ene foran praecis tre cifre, er det tusinder
// ("1.200"), ellers decimaler ("12,50"). Kopi af _shared/pris.ts - runneren
// er en tekst og kan ikke importere.
function helKroner(v){
 if(typeof v==='number')return isFinite(v)&&v>0?Math.round(v):0;
 var m=String(v==null?'':v).replace(/(\d)[\s\u00a0](?=\d{3}(?!\d))/g,'$1').match(/\d[\d.,]*/);
 if(!m)return 0;
 var t=m[0].replace(/[.,]+$/,'');
 var i=Math.max(t.lastIndexOf('.'),t.lastIndexOf(','));
 if(i>=0){
  var begge=t.indexOf('.')>-1&&t.indexOf(',')>-1;
  var flere=t.split(t[i]).length>2;
  t=(begge||(!flere&&t.length-i-1!==3))
   ?t.slice(0,i).replace(/[.,]/g,'')+'.'+t.slice(i+1)
   :t.replace(/[.,]/g,'');
 }
 var n=Math.round(Number(t));
 return isFinite(n)&&n>0?n:0;
}

// Annoncens egne data, til prisvagten og synkroniseringen.
//
// /api/v2/items/{id} svarer 404 på ALLE annoncer siden Vinted flyttede deres
// API (målt 1. oktober, også på en annonce der lå ude). En 404 derfra siger
// altså intet om annoncen — før blev den læst som "væk", og så ville hver
// eneste tilknyttede annonce være meldt solgt. Kun annoncesidens egen 404
// betyder, at annoncen er væk.
//
// Kilderne, i rækkefølge: API'et (hvis det kommer igen), den side du står på
// (koster ingenting), og ellers annoncesiden hentet på ny.
// kunApi: den stille aflæsning må ikke HENTE annoncesiden. Den vejer ~2 MB, og
// aflæsningen kører uopfordret på telefonens forbindelse. Den side, der
// allerede er åben, må gerne læses.
async function hentVare(id,kunApi){
 try{
  var r=await timedFetch('/api/v2/items/'+id,
   {headers:{'Accept':'application/json'},credentials:'include'},15000);
  if(r.ok){
   var j=await r.json(),it=(j&&(j.item||j))||null;
   if(it&&(it.price!==undefined||it.id!==undefined)){
    var p=it.price;
    var beloeb=helKroner((p&&typeof p==='object')?p.amount:p)||NaN;
    var lukket=!!(it.is_closed||it.is_hidden||it.is_deleted||it.is_sold||
     (it.status&&/sold|solgt|closed|lukket/i.test(String(it.status))));
    // Annoncens egne ord. De kan være rettet i Vinteds formular, efter appen
    // slap den — og så er DET, der står her, sandheden om varen.
    var udgivet={
     price:isFinite(beloeb)?beloeb:null,
     title:plukk(it,['title']),
     description:plukk(it,['description']),
     brand:plukk(it,['brand_title','brand','brand_dto']),
     size:plukk(it,['size_title','size']),
     condition:plukk(it,['status','condition']),
     color:plukk(it,['color1','color','colour']),
     url:location.origin+'/items/'+id,
     kilde:'api'
    };
    var mangler=[];
    for(var k in udgivet)if(udgivet[k]===null)mangler.push(k);
    log('vagt: '+id+' målt via api'+(lukket?' (lukket)':'')+
        (mangler.length?' — mangler: '+mangler.join(','):''));
    return {gone:lukket,price:udgivet.price,
            favourites:+(it.favourite_count||0),views:+(it.view_count||0),
            udgivet:udgivet};
   }
  }
 }catch(e){}
 // Står du på annoncen, er siden her allerede. Vinted skifter adresse uden at
 // genindlæse, så sidens data skal bære det rigtige nummer, før de bruges.
 if(new RegExp('^/items/'+id+'(?:\\D|$)').test(location.pathname)){
  var her=laesAnnonceside(document.documentElement.outerHTML,id);
  if(her){log('vagt: '+id+' målt på den åbne side');return her}
 }
 if(kunApi){log('synk: '+id+' svarede ikke via api');return null}
 try{
  var h=await timedFetch('/items/'+id,{credentials:'include'},15000);
  if(h.status===404||h.status===410){log('vagt: '+id+' findes ikke (side)');return {gone:true}}
  if(!h.ok)return null;
  var set=laesAnnonceside(await h.text(),id);
  if(set){log('vagt: '+id+' målt via annoncesiden');return set}
 }catch(e){}
 log('vagt: '+id+' kunne ikke måles');
 return null;
}

// Annoncesiden tegnes på serveren, og varens data står i dens JSON-LD
// (<script type="application/ld+json">, et Product med offers). Resten af
// siden er React-data med \" overalt, og "title" eller "amount" dér kan lige
// så godt høre til en oversættelse eller en anden vare — det skete. Hjerterne
// står kun dér, så de findes på varens EGET nummer.
// Størrelse og Vinteds egen standtekst står ikke i JSON-LD; de sendes som null,
// og null betyder "ikke målt", ikke "tom".
function laesAnnonceside(t,id){
 var blokke=t.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/g)||[];
 var p=null;
 for(var i=0;i<blokke.length&&!p;i++){
  try{
   var o=JSON.parse(blokke[i].replace(/^<script[^>]*>/,'').replace(/<\/script>$/,''));
   var liste=Array.isArray(o)?o:(o['@graph']||[o]);
   for(var k=0;k<liste.length;k++){
    var x=liste[k];
    if(x&&x['@type']==='Product'&&x.offers&&String(x.offers.url||'').indexOf('/items/'+id)>-1){p=x;break}
   }
  }catch(e){}
 }
 if(!p)return null;
 var tilbud=Array.isArray(p.offers)?p.offers[0]:p.offers;
 // JSON-LD bærer sælgerens valuta: en svensk annonce stod som 299 SEK, mens
 // søgningen viste den til 199 kr. Kun kroner er en pris her.
 var dkk=!tilbud.priceCurrency||tilbud.priceCurrency==='DKK';
 var pris=dkk?(helKroner(tilbud.price)||null):null;
 var mf=t.match(new RegExp('favourite_count\\\\?":(\\d+),\\\\?"is_favourite\\\\?":(?:true|false),\\\\?"item_id\\\\?":\\\\?"?'+id+'\\b'));
 var brand=p.brand&&(p.brand.name||p.brand);
 return {
  // Kun et udtrykkeligt "udsolgt" tæller som væk. At melde en annonce solgt,
  // der ikke er det, er værre end at opdage et salg en runde senere.
  gone:/SoldOut|OutOfStock|Discontinued/i.test(String(tilbud.availability||'')),
  price:pris||0,favourites:mf?+mf[1]:0,views:0,
  udgivet:{price:pris,
           title:p.name?String(p.name):null,
           description:p.description?String(p.description):null,
           brand:brand?String(brand):null,
           size:null,condition:null,
           color:p.color?String(p.color):null,
           url:location.origin+'/items/'+id,kilde:'side'}};
}

// Ét tilsyn: hvad er forfaldent, hvordan står det til, og hvad siger serveren.
async function tilsynsrunde(){
 var forfaldne=[];
 try{
  var r=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({mode:'due'})},20000);
  forfaldne=((await r.json())||{}).forfaldne||[];
 }catch(e){log('vagt: kunne ikke hente forfaldne');return null}
 if(!forfaldne.length){log('vagt: intet forfaldent');return null}
 log('vagt: '+forfaldne.length+' vare(r) til tjek');

 var maalinger=[];
 for(var i=0;i<forfaldne.length;i++){
  var f=forfaldne[i];
  var set=await hentVare(f.itemId);
  if(!set){continue}
  if(set.gone){maalinger.push({id:f.id,gone:true});continue}
  // Feltet måles på ny hver gang. En pris fra i går siger intet om, hvad
  // tilsvarende varer koster i dag — og det er hele grundlaget.
  var felt=await search(f.query||f.title||'',40);
  maalinger.push({id:f.id,price:set.price,favourites:set.favourites,
                  views:set.views,comparables:felt,udgivet:set.udgivet});
 }
 if(!maalinger.length)return null;

 try{
  var sv=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({mode:'watch',maalinger:maalinger})},90000);
  var j=await sv.json();
  var b=(j&&j.beslutninger)||[];
  var poster=[];
  for(var k=0;k<b.length;k++){
   if(b[k].handling==='saenk'&&b[k].nyPris>0&&b[k].externalId)
    poster.push({listing:b[k].id,itemId:String(b[k].externalId),
                 felter:{price:b[k].nyPris},pris:b[k].nyPris,fra:b[k].fraPris});
  }
  log('vagt: '+b.length+' afgjort, '+poster.length+' prisændring(er)');
  return {beslutninger:b,poster:poster};
 }catch(e){log('vagt: tilsynet fejlede');return null}
}

// Skriv de ændringer, der venter, ind på annoncens redigeringsside og gem.
// Kvitteringen sendes først, når ændringerne er læst tilbage fra annoncen —
// ikke når felterne ser rigtige ud. Det er den samme lære som fra DBA:
// DOM'en lyver, kilden gør ikke.
var FELT_TIL_INPUT={price:'#price',title:'#title',description:'#description'};

async function anvend(post){
 var f=post.felter||{};
 // Prisfeltet er det eneste, der altid er der. Er det ikke dukket op, er vi
 // ikke på redigeringssiden endnu.
 for(var i=0;i<60;i++){ if(q('#price')||q('#title'))break; await sleep(250) }

 var sat=[],manglende=[],allerede=[];
 for(var navn in FELT_TIL_INPUT){
  if(!(navn in f)||f[navn]===null||f[navn]==='')continue;
  var el=q(FELT_TIL_INPUT[navn]);
  if(!el){manglende.push(navn);continue}
  // Redigeringssiden viser det, Vinted har gemt. Står ændringen der allerede
  // — fordi Gem gik igennem sidst, men kvitteringen aldrig nåede frem — er
  // der intet at skrive. 5. oktober stod 12 rettelser »klar« i appen, som
  // alle var gemt på Vinted.
  if(navn==='price'?helKroner(el.value)===helKroner(f[navn]):ensLyd(el.value,f[navn])){
   allerede.push(navn);continue;
  }
  if(navn==='price')setPris(el,String(helKroner(f[navn])));else setv(el,String(f[navn]));
  sat.push(navn);
  await sleep(150);
 }
 if(!sat.length&&allerede.length){
  spor('anvend: '+allerede.join(', ')+' stod allerede i annoncen');
  var fra={kilde:'formular',url:location.origin+'/items/'+post.itemId};
  for(var fn in FELT_TIL_INPUT){var fe=q(FELT_TIL_INPUT[fn]);if(fe)fra[fn]=fn==='price'?helKroner(fe.value):fe.value}
  var kv=await kvitter(post,fra);
  if(kv&&kv.ok&&!(kv.tilbage||[]).length)kv.tekst='Ændringen stod allerede i annoncen — kvitteret i appen.';
  else baand('Kunne ikke kvittere i appen. Prøv igen fra appen.',null,null);
  return kv;
 }
 if(!sat.length){
  log('anvend: ingen felter kunne sættes ('+manglende.join(',')+')');
  baand('Felterne kunne ikke findes på redigeringssiden.',null,null);
  return false;
 }
 log('anvend: satte '+sat.join(', ')+(manglende.length?' — manglede '+manglende.join(','):''));
 await sleep(300);
 try{localStorage.setItem('udbakke_prisvagt_sat',JSON.stringify(
  {listing:post.listing,itemId:post.itemId,felter:f,satte:sat,tid:Date.now()}))}catch(e){}

 // Findes knappen ikke, står ændringerne i felterne, og du trykker selv —
 // ventetiden herunder kvitterer alligevel, når formularen forsvinder.
 var gem=findGemKnap();
 if(!gem){
  baand('Ændringerne er sat ind ('+sat.join(', ')+'). Tryk Gem for at gemme dem.',null,null);
  spor('anvend: fandt ingen gem-knap');
 }else{
  gem.click();
  spor('anvend: gemmer '+sat.join(', '));
 }
 return await efterGem();
}

// Gem-knappen har ikke noget stabilt kendetegn, så den findes på sin tekst.
// I et bredt vindue står vælgerpanelerne åbne i siden med hver sin »Gem«
// (input-dropdown-save-button), og den første knap med den tekst gemmer kun
// et panel. Formularens egen knap står nederst: den sidste, der passer.
function findGemKnap(){
 var knapper=document.querySelectorAll('button,[role=button]'),gem=null;
 for(var n=0;n<knapper.length;n++){
  var k=knapper[n];
  if(k.disabled)continue;
  var tid=k.getAttribute('data-testid')||'';
  if(/dropdown|draft/i.test(tid))continue;
  if(k.closest('.ReactModal__Content,[data-testid$="-content"]'))continue;
  var tx=(k.textContent||'').trim().toLowerCase();
  if(/billed|foto|photo|kladde|draft/.test(tx))continue;
  if(/^(gem|upload|opdater|opdatér|save|update)(\s|$)/.test(tx))gem=k;
 }
 return gem;
}

// Efter Gem skifter Vinted adresse UDEN at genindlæse siden (Next.js), så et
// script, der venter på »næste side«, venter forgæves — det var derfor, ingen
// rettelse nogensinde blev kvitteret. Vi bliver her og ser formularen
// forsvinde. Genindlæses siden alligevel, tager bekraeft() over ved næste
// indlæsning: markøren ligger i localStorage.
async function efterGem(){
 for(var i=0;i<600;i++){
  await sleep(1000);
  if(!/\/edit/.test(location.pathname)||!q('#title'))break;
 }
 if(/\/edit/.test(location.pathname)&&q('#title')){
  spor('anvend: formularen står stadig efter 10 min');
  baand('Vinted har ikke gemt ændringen endnu. Tjek formularen, og tryk Gem.',null,null);
  return null;
 }
 var v=hentMarkoer();
 return v?await bekraeftNu(v):null;
}

// Efter Gem sender Vinted dig tilbage til annoncen. Her læses den igen, og
// først dér er ændringen en kendsgerning.
function ensLyd(a,b){
 var n=function(x){return String(x==null?'':x).replace(/\s+/g,' ').trim().toLowerCase()};
 return n(a)===n(b);
}

var MARKOER='udbakke_prisvagt_sat';
function hentMarkoer(){
 var raw; try{raw=localStorage.getItem(MARKOER)}catch(e){return null}
 if(!raw)return null;
 var v; try{v=JSON.parse(raw)}catch(e){v=null}
 if(!v||(Date.now()-v.tid)>1800000){try{localStorage.removeItem(MARKOER)}catch(e){}return null}
 return v;
}

// Genindlæst efter Gem: står vi på annoncen, markøren peger på?
async function bekraeft(){
 var v=hentMarkoer();
 if(!v)return null;
 var num=location.pathname.match(/^\/items\/(\d+)/);
 if(!num||num[1]!==String(v.itemId)||/\/edit/.test(location.pathname))return null;
 return await bekraeftNu(v);
}

// Annoncen hentes frisk fra Vinted — ikke den åbne side, som efter et
// adresseskift uden genindlæsning kan bære den gamle annonces data, og ikke
// /api/v2/items, som svarer 404 på alt. Sidens JSON-LD har titel, hele
// beskrivelsen og prisen (målt 5. oktober: længderne passer tegn for tegn).
async function laesFrisk(id){
 try{
  var h=await timedFetch('/items/'+id,{credentials:'include',cache:'no-store'},20000);
  if(h.status===404||h.status===410)return {gone:true};
  if(!h.ok)return null;
  return laesAnnonceside(await h.text(),id);
 }catch(e){return null}
}

async function bekraeftNu(v){
 try{localStorage.removeItem(MARKOER)}catch(e){}
 var b=baand('Tjekker, at Vinted har gemt ændringen …',null,null);
 var set=null,ikke=[];
 // Vinted kan være et øjeblik om at udlevere den nye tekst.
 for(var forsoeg=0;forsoeg<4;forsoeg++){
  if(forsoeg)await sleep(3000);
  set=await laesFrisk(v.itemId);
  if(!set||!set.udgivet)continue;
  ikke=(v.satte||[]).filter(function(navn){
   var oenske=v.felter[navn], faktisk=set.udgivet[navn];
   return !((navn==='price')
    ? (Math.round(Number(faktisk))===Math.round(Number(oenske)))
    : ensLyd(faktisk,oenske));
  });
  if(!ikke.length)break;
 }
 if(b)b.remove();
 if(!set||!set.udgivet){
  spor('bekræft: '+v.itemId+' kunne ikke læses');
  baand('Annoncen kunne ikke læses bagefter. Rettelsen står stadig som klar i appen.',null,null);
  return null;
 }
 // Serveren afgør selv, hvad der står i annoncen, og rydder kun dét af
 // rettelsen. Det, der ikke gik igennem, bliver stående som klar.
 var kv=await kvitter(v,set.udgivet);
 spor('bekræft: '+v.itemId+' — '+(kv&&kv.ok?'kvitteret'+((kv.tilbage||[]).length?', mangler '+kv.tilbage.join(','):''):'kunne ikke kvittere'));
 if(!kv||!kv.ok)baand('Gemt på Vinted, men appen kunne ikke kvittere. Prøv igen fra appen.',null,null);
 else if((kv.tilbage||[]).length)baand('Gik ikke igennem på Vinted: '+kv.tilbage.join(', ')+'. Den står stadig som klar i appen.',null,null);
 else kv.tekst='Gemt på Vinted og kvitteret i appen.';
 return kv;
}

async function kvitter(v,udgivet){
 besoegt(v.itemId);
 try{
  var r=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({mode:'anvendt',listing:v.listing,price:udgivet.price,
    udgivet:udgivet,besoegt:rundeBesoegt()})},20000);
  return await r.json();
 }catch(e){return null}
}

// »Send N rettelser« i appen er ét tryk for dem alle: redigeringssiden får
// ?udbakke=ret, og runneren går selv videre til den næste, når den forrige er
// kvitteret. Besøgte annoncer springes over, så en, der ikke vil gemme, ikke
// sender runden i ring.
var RUNDE='udbakke_ret_runde';
// Appens flag (udbakke=vagt/synk/ret). Det staar efter # og ikke efter ?:
// Vinted omdirigerer /items/{id}?… til /items/{id}-titel og smider ?-delen
// vaek, mens #-delen foelger med. Maalt 8. oktober. ?-formen laeses stadig,
// for en app, der ikke er opdateret, sender den.
function flag(navn){
 return new RegExp('[?&#]udbakke='+navn+'(?:&|$)').test(location.search+location.hash);
}
function rundeAktiv(){
 try{
  if(flag('ret')&&!sessionStorage.getItem(RUNDE))
   sessionStorage.setItem(RUNDE,JSON.stringify({tid:Date.now(),ids:[]}));
  var r=JSON.parse(sessionStorage.getItem(RUNDE)||'null');
  return !!(r&&Date.now()-r.tid<3600000);
 }catch(e){return false}
}
function rundeBesoegt(){
 try{return (JSON.parse(sessionStorage.getItem(RUNDE)||'null')||{}).ids||[]}catch(e){return []}
}
function besoegt(id){
 try{
  var r=JSON.parse(sessionStorage.getItem(RUNDE)||'null');
  if(!r)return;
  if(r.ids.indexOf(String(id))<0)r.ids.push(String(id));
  sessionStorage.setItem(RUNDE,JSON.stringify(r));
 }catch(e){}
}

// Efter en kvittering: næste pris i prisvagtens kø, ellers næste rettelse i
// runden. Er der ingen af dem, er vi færdige — og gik alt igennem, lukkes
// fanen.
function videre(itemId,kv){
 afslut(itemId);
 var n=naeste();
 if(n){location.href='/items/'+n.itemId+'/edit';return true}
 if(kv&&kv.naeste&&rundeAktiv()){location.href='/items/'+kv.naeste+'/edit?udbakke=ret';return true}
 try{sessionStorage.removeItem(RUNDE)}catch(e){}
 if(kv&&kv.tekst)lukFanen(kv.tekst);
 return false;
}

// Næste post i køen. Er der ikke flere, er runden slut.
function naeste(){
 var k=koeLaes();
 if(!k||!k.poster.length){koeSkriv(null);return null}
 return k.poster[0];
}
function afslut(itemId){
 var k=koeLaes();
 if(!k)return;
 k.poster=k.poster.filter(function(p){return String(p.itemId)!==String(itemId)});
 koeSkriv(k);
}

// Appens "Opdatér fra Vinted" lander her: annoncens egen side med et flag i
// adressen. Så læses annoncen, og appen får at vide, hvad der FAKTISK står i
// den — pris, titel, beskrivelse, størrelse, mærke.
async function synkroniser(){
 if(!flag('synk'))return false;
 var num=location.pathname.match(/^\/items\/(\d+)/);
 if(!num)return false;
 var b=baand('Læser annoncen …',null,null);
 var set=await hentVare(num[1]);
 if(b)b.remove();
 if(!set){baand('Annoncen kunne ikke læses.',null,null);return true}
 try{
  var j=await sendSynk(num[1],set);
  if(j&&j.ukendt){baand('Den annonce hører ikke til en vare i appen.',null,null);return true}
  lukFanen(set.gone?'Annoncen findes ikke længere — noteret som solgt.'
                  :'Appen er opdateret med annoncens egne oplysninger.');
 }catch(e){baand('Kunne ikke sende opdateringen videre.',null,null)}
 return true;
}

async function sendSynk(itemId,set){
 var r=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({mode:'synk',item_id:String(itemId),gone:!!set.gone,
   price:set.price,favourites:set.favourites,udgivet:set.udgivet})},20000);
 return await r.json();
}

// Synkroniseringen tilbage fra Vinted, uden at du beder om den: står du på en
// af dine egne annoncer, læses DEN. Retter du titel eller pris i Vinteds
// formular og trykker Gem, sender Vinted dig hertil — så er appen ajour, før
// du er færdig med at kigge. Ingen bånd og ingen navigation.
//
// Der er bevidst ingen runde over de andre annoncer. Salg, bud og beskeder
// når serveren som mail fra Vinted (vinted-mail), og en runde på et ur var
// netop dét, du ikke ville have.
async function stilleSynk(){
 // /items/1234567890-nike-jakke: nummeret, og en sti der ikke fortsætter.
 var num=location.pathname.match(/^\/items\/(\d+)(?:-[^\/]*)?\/?$/);
 if(!num)return;
 var set=await hentVare(num[1],true);
 if(!set)return;
 try{var j=await sendSynk(num[1],set);if(j&&!j.ukendt)log('synk: '+num[1]+' læst')}catch(e){}
}

async function prisvagt(){
 // Kommer vi fra appens Prisvagt-knap, er der givet lov til at ændre priser.
 var bedt=flag('vagt');

 rundeAktiv();
 // 1) Lige gemt en pris? Så skal den bekræftes, før noget andet.
 var mk=hentMarkoer();
 var kv0=await bekraeft();
 if(kv0){videre(mk.itemId,kv0);return true}

 // 2) Står vi på en redigeringsside, som køen peger på? Så sæt prisen.
 var red=location.pathname.match(/^\/items\/(\d+)\/edit/);
 if(red){
  var k=koeLaes();
  var post=k&&k.poster.filter(function(p){return String(p.itemId)===red[1]})[0];
  // Ligger der ingen kø, så spørg serveren. Du kan være kommet hertil fra
  // appen dage efter, tilsynet traf beslutningen — og beslutningen står
  // stadig ved magt, selvom køen i browseren for længst er udløbet.
  if(!post){
   try{
    var sv=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({mode:'pending',item_id:red[1]})},20000);
    var pj=((await sv.json())||{}).pending;
    if(pj)post={listing:pj.listing,itemId:red[1],felter:pj.felter,fra:pj.fra};
   }catch(e){}
  }
  if(post){
   var kv=await anvend(post);
   if(kv&&kv.ok)videre(red[1],kv);
   return true;
  }
  return false;
 }

 // 3) Ellers: er der noget forfaldent? Kun én runde i timen, og kun når vi
 //    ikke er midt i noget andet — målingen koster data på telefonen.
 if(!bedt){
  try{
   var sidst=+(localStorage.getItem(VAGT_SIDST)||0);
   if(Date.now()-sidst<3600000)return false;
  }catch(e){}
 }
 try{localStorage.setItem(VAGT_SIDST,String(Date.now()))}catch(e){}

 // Du har trykket i appen: vis, at der sker noget. Maalingen tager et par
 // sekunder pr. vare, og uden baand saa det ud, som om intet skete.
 var vb=bedt?baand('Prisvagt: tjekker varerne mod markedet …',null,null):null;
 var res=await tilsynsrunde();
 if(vb)vb.remove();
 if(!res){
  if(bedt){
   spor('vagt: tjekket gav intet (se log)');
   baand('Prisvagt: tjekket kunne ikke gennemføres — intet forfaldent, eller varerne kunne ikke måles.',null,null);
  }
  return false;
 }
 if(!res.poster.length){
  if(bedt)lukFanen('Prisvagt: tjekket er kørt — ingen priser skal ned lige nu.');
  return false;
 }
 koeSkriv({tid:Date.now(),poster:res.poster});
 var f1=res.poster[0];
 var tekst='Prisvagt: '+res.poster.length+
  (res.poster.length===1?' vare skal ned i pris':' varer skal ned i pris')+
  ' ('+f1.fra+' → '+f1.pris+' kr'+(res.poster.length>1?' først':'')+').';
 if(bedt){location.href='/items/'+f1.itemId+'/edit';return true}
 baand(tekst,'Sæt priserne',function(){location.href='/items/'+f1.itemId+'/edit'});
 return false;
}

// Er vi havnet på en annonces egen side, og lå der et udkast i formularen for
// lidt siden, så er det dét, du netop har lagt op. Så flytter appen det selv
// over i "Afsendte annoncer" — du skal ikke også huske at sige det.
//
// Men Vinted sender dig IKKE videre til annoncens side efter Upload - det var
// et gaet, og ingen af nr. 5-20 blev tilknyttet ad den vej. Derfor kigger vi
// ogsaa i din garderobe: det nyeste nummer dér blev noteret ved udfyldningen
// (foer), og dukker der et nyere op, er det den annonce, du lagde op.
// Efterloebet: se mode 'efterloeb' i index.ts. Spoerg foerst, om der er
// noget at lede efter; garderoben (~60 kB) hentes kun, naar der er.
async function efterloeb(){
 try{
  var r=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({mode:'efterloeb'})},15000);
  var j=await r.json();
  if(!j||!j.behov||!j.bruger)return;
  var g=await timedFetch('/api/v2/wardrobe/'+j.bruger+'/items?page=1&per_page=10&order=newest_first',
   {headers:{'Accept':'application/json'},credentials:'include'},15000);
  if(!g.ok){spor('efterloeb: garderobe '+g.status);return}
  var gj=await g.json();
  var varer=(gj.items||[]).map(function(it){return {
   id:String(it.id),title:it.title||'',is_draft:!!it.is_draft,
   price:it.price&&it.price.amount,url:it.url||'',brand:it.brand||'',
   size:it.size||'',status:it.status||''}});
  var s=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({mode:'efterloeb',items:varer})},20000);
  var sj=await s.json();
  (sj&&sj.fundet||[]).forEach(function(f){spor('efterloeb: nr '+f.nr+' er '+f.item_id)});
 }catch(e){spor('efterloeb: '+e.message)}
}
var AFVISTE={};
async function meldPostet(){
 var v=hentAfventer();
 if(!v)return false;
 var num=location.pathname.match(/^\/items\/(\d+)/);
 var itemId=(num&&!AFVISTE[num[1]])?num[1]:null;
 if(!itemId&&v.foer){
  var ny=await nyesteIGarderoben(v.bruger);
  if(ny&&ny>v.foer&&!AFVISTE[ny])itemId=String(ny);
  else spor('venter: nyeste '+(ny||'ukendt')+', foer '+v.foer,v.id);
 }else if(!itemId)spor('venter: intet foer-nummer',v.id);
 if(!itemId)return false;
 try{sessionStorage.removeItem('udbakke_afventer')}catch(e){}
 // Prisen læses på annoncen selv, ikke på det vi troede vi skrev. Du kan have
 // rettet den i formularen, inden du trykkede Upload — og prisvagten skal
 // regne fra dét, der faktisk står ude.
 var set=await hentVare(itemId);
 try{
  var sv=await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:v.id,mode:'posted',item_id:itemId,
    url:location.origin+'/items/'+itemId,
    price:(set&&set.price)||0,
    udgivet:(set&&set.udgivet)||null})},20000);
  var svar=null; try{svar=await sv.json()}catch(e){}
  // Ikke den nye annonce (en anden vare, du kiggede paa). Markoeren laegges
  // tilbage, saa den rigtige annonce stadig kan melde sig.
  if(svar&&svar.afvist){
   AFVISTE[itemId]=1;
   saetAfventer(v);
   log('postet: '+itemId+' er ikke den nye annonce ('+svar.afvist+') - venter videre');
   return 'afvist';
  }
  log('annoncen er lagt op — flyttet til afsendte, prisvagten holder øje');
 }catch(e){}
 return true;
}
function saetAfventer(v){
 try{sessionStorage.setItem('udbakke_afventer',JSON.stringify(v))}catch(e){}
}
function hentAfventer(){
 // En markoer fra foer 2. oktober kan ligge i localStorage. Den er ikke til at
 // stole paa - enhver fane kunne tage den - saa den ryddes bare.
 try{localStorage.removeItem('udbakke_afventer')}catch(e){}
 var raw; try{raw=sessionStorage.getItem('udbakke_afventer')}catch(e){return null}
 if(!raw)return null;
 var v; try{v=JSON.parse(raw)}catch(e){v=null}
 // En time. Ligger der noget ældre, er det en rest fra en annonce, du
 // fortrød — den må ikke markeres som solgt-og-lagt-op.
 if(!v||!v.id||(Date.now()-v.tid)>3600000){
  try{sessionStorage.removeItem('udbakke_afventer')}catch(e){}
  return null;
 }
 return v;
}
// Det hoejeste annoncenummer i din garderobe. Kun fem raekker, nyeste foerst -
// det kaldes hvert femte sekund, mens du retter i formularen. En Vinted-kladde
// taeller ikke: den kan dukke op, foer du har trykket Upload.
async function nyesteIGarderoben(bruger){
 if(!bruger)return null;
 try{
  var r=await timedFetch('/api/v2/wardrobe/'+bruger+'/items?page=1&per_page=5&order=newest_first',
   {headers:{'Accept':'application/json'},credentials:'include'},10000);
  if(!r.ok){spor('garderobe: '+r.status);return null}
  var j=await r.json(),maks=0;
  (j.items||[]).forEach(function(it){
   var n=+(it&&it.id)||0;
   if(n>maks&&!it.is_draft)maks=n;
  });
  return maks||null;
 }catch(e){spor('garderobe: '+e.message);return null}
}

// Automatisk tilstand starter, så snart siden er tegnet — felterne kan sagtens
// mangle endnu.
async function waitForm(){
 for(var i=0;i<80;i++){
  if(q('#title')&&q('#description')&&q('#price'))return true;
  await sleep(250);
 }
 return false;
}
// Et gammelt brugerscript koerer ogsaa. Serveren afviser det, men det skal
// slettes - ellers koerer det sin gamle prisvagt og synkronisering paa hver side.
if(ANDEN_RUNNER){
 spor('en anden runner koerte foerst (gammelt brugerscript?)');
 baand('Udbakke: et gammelt brugerscript kører også. Slet det i Userscripts — kun »Udbakke« 2.0 skal være der.',null,null);
}
// Laa der en markoer fra en udfyldning, der ikke blev meldt, saa kig efter den
// nu. Paa opret-siden skal en ny udfyldning stadig koere bagefter.
if(await meldPostet()===true&&!/\/items\/new/.test(location.pathname))return;
// Efterloebet koerer ved siden af, uanset siden - det maa ikke forsinke en
// udfyldning eller et tilsyn.
efterloeb();
// Kom fanen fra appen? Noteres nu, mens flaget stadig staar i adressen. Saa
// er der arbejde, du venter paa, og skaermen holdes taendt imens.
if(fraApp())vaagen(5);
// Uden for /items/ er der kun det ovenfor at goere. Brugerscriptet koerer paa
// hele vinted.dk, fordi Upload sender dig videre med en rigtig sideindlaesning
// til en side uden for /items/ - og dér skal markoeren kunne melde annoncen.
// Annoncen kan staa i garderoben et par sekunder efter, at siden er landet.
if(!/^\/items\//.test(location.pathname)){
 if(hentAfventer()){spor('landet efter upload',hentAfventer().id);vaagen(2)}
 for(var forsoeg=0;forsoeg<24&&hentAfventer();forsoeg++){
  await sleep(5000);
  if(await meldPostet()===true)break;
 }
 return;
}
// Prisvagten kører på alle annoncesider undtagen opret-siden: dér er
// udfyldningen det eneste, der skal ske, og den må ikke vente på et tilsyn.
if(!/\/items\/new/.test(location.pathname)){
 // Et udtrykkeligt "hent annoncen" gaar foran tilsynet: du har bedt om DEN
 // ene vare, og saa skal der ikke foerst maales markedet for tre andre.
 try{ if(await synkroniser())return; }catch(e){log('synk: '+e.message)}
 var optaget=false;
 try{optaget=await prisvagt()}catch(e){log('vagt: '+e.message)}
 // Er prisvagten i gang med at skrive i en annonce, venter den stille
 // aflæsning. Redigeringssiden læses heller ikke: dér er det, der står i
 // felterne, ikke gemt endnu.
 if(!optaget&&!/\/edit/.test(location.pathname)){
  try{await stilleSynk()}catch(e){log('synk: '+e.message)}
 }
 return;
}
if(!await waitForm()){
 if(!AUTO)alert('VintedAuto: du er ikke på opret-siden. Gå til Vinted → Sælg nu, og tryk på bogmærket der.');
 return;
}

try{
 var d=await(await timedFetch(API+(AUTO?'&auto=1':''),{},25000)).json();
 // I automatisk tilstand betyder "tomt", at du ikke har bedt om noget her —
 // så skal siden være helt i fred.
 if(d.empty){if(!AUTO)alert('VintedAuto: ingen klar udkast i køen.');return}
 DRAFT_ID=d.id;
 // Markedsrunden kan vente op til 90 s paa en nypris; resten tager et minut.
 vaagen(10);
 spor('udfylder: siden klar '+(await waitReady()),DRAFT_ID);

 // Markedsopslaget sker HERFRA, fra din egen session: Vinted blokerer
 // serverkald, men aldrig sin egen side. Serveren kan altså ikke se markedet —
 // det kan telefonen.
 // Vinted vil have hele kroner. Prisen kan komme tre steder fra:
 // markedsopslaget, en tidligere kontrolrunde, eller udkastets egen
 // foreloebige pris fra billedanalysen — og kun de to foerste er rundet af.
 // Derfor staar reglen HER, lige foer feltet, hvor alle tre veje moedes.
 var MIN_PRIS=8;
 function vintedPris(v){
  // Baade 12.50, 12,50 og 1.200 kan naa hertil: udkastet gemmer prisen som
  // tekst. Samme fortolkning som helKroner i _shared/pris.ts.
  var n=helKroner(v);
  // Tom eller ulaeselig pris er ikke en pris med decimaler - dér skal der ikke
  // opfindes et tal, feltet skal staa tomt og falde i oejnene.
  if(!isFinite(n)||n<=0)return v;
  return String(Math.max(MIN_PRIS,Math.round(n)));
 }

 var price=d.price,note='foreløbig pris';
 var marked=await markedsanalyse(d);
 if(marked){
  if(marked.title)bedre.title=marked.title;
  if(marked.description)bedre.description=marked.description;
  if(marked.price)price=marked.price;
  note=marked.note||note;
 }else{
  note='Prisen er IKKE tjekket mod markedet: '+(MARKED_FEJL||'ukendt fejl')+
   '. '+(helKroner(price)>0?helKroner(price)+' kr':'Prisen')+' er analysens skøn — se den efter, før du trykker Upload';
 }
 spor('pris: '+note,DRAFT_ID);

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
 var rettet=vintedPris(price);
 if(String(rettet)!==String(price)){
  log('pris: '+price+' rettet til '+rettet+' (hele kroner)');
  price=rettet;
 }

 var t2=q('#title'),de2=q('#description'),pe2=q('#price');
 if(t2)setv(t2,bedre.title||d.title);
 if(de2)setv(de2,bedre.description||d.description);
 if(pe2)setPris(pe2,price);
 log('tekst sat');

 // Til sidst billederne. Uploaden kører videre af sig selv herfra.
 log('billeder: '+(d.photos||[]).length);
 if(await fillPhotos(d.photos))mangler.push('billeder');
 log('billeder klar');

 // Gem hvilket udkast der ligger i formularen, og det nyeste nummer i din
 // garderobe lige nu. Trykker du Upload, dukker et nyere op dér - og saa ved
 // vi, at annoncen er landet, og hvilket nummer den fik.
 // Markoeren ligger i DENNE fanes sessionStorage, ikke i localStorage: den
 // deles af alle faner, og 2. oktober tog en anden fane med nr. 10's sandaler
 // markoeren for nr. 18.
 var foer=await nyesteIGarderoben(d.vintedBruger);
 spor('garderobe foer upload: '+(foer||'ukendt'),DRAFT_ID);
 saetAfventer({id:DRAFT_ID,tid:Date.now(),bruger:d.vintedBruger||null,foer:foer});
 // Vinted skifter adresse UDEN at genindlaese siden (Next.js), og Safari
 // bliver staaende efter Upload. Saa vi holder selv oeje, saa laenge fanen er
 // aaben: ved hvert adresseskift, og ellers med garderoben. Fem raekker vejer
 // ~60 kB, saa der kigges kun tæt, naar formularen er vaek - det er den efter
 // Upload, hvad adressen saa end siger: hvert 3. sekund i to minutter, siden
 // hvert halve minut. Mens du retter i formularen, en gang i minuttet. Afviser
 // serveren annoncen (ikke den nye), ventes der videre.
 var vaekTid=0,sidstSti=location.pathname,sidstKig=Date.now(),travl=false;
 var vagtAdr=setInterval(function(){
  if(travl)return;
  if(!hentAfventer()){clearInterval(vagtAdr);return}
  var sti=location.pathname,nu=Date.now();
  var nySti=sti!==sidstSti; sidstSti=sti;
  if(q('#title'))vaekTid=0; else if(!vaekTid){vaekTid=nu;spor('formularen er vaek',DRAFT_ID);vaagen(3)}
  var hvert=!vaekTid?60000:(nu-vaekTid<120000?3000:30000);
  if(!nySti&&nu-sidstKig<hvert)return;
  sidstKig=nu; travl=true;
  meldPostet().then(function(r){
   travl=false;
   if(r===true){clearInterval(vagtAdr);slip()}
  },function(e){travl=false;log('postet: '+e.message)});
 },1000);
 setTimeout(function(){clearInterval(vagtAdr)},3600000);
 // Saetter iOS fanen til at sove, staar vagten stille. Det skal kunne ses.
 document.addEventListener('visibilitychange',function(){
  if(hentAfventer())spor('fanen er '+(document.hidden?'skjult':'synlig'),DRAFT_ID);
 });

 // Markeringen ryddes, så et genindlæs ikke fylder den samme annonce ud igen.
 if(AUTO){try{await timedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({id:DRAFT_ID,mode:'clear',log:LOG.slice(-150)})},15000)}catch(e){}}

 // Nu er det dig, der trykker; skaermen slukker ikke, mens du roerer ved den.
 slip();
 say('Udfyldt: '+d.title+'\n'+note+'.\n'+
  (mangler.length?'Sæt selv: '+mangler.join(', ')+'.':'Alle felter og billeder er sat.')+
  '\nTjek annoncen igennem og tryk Upload.');
}catch(e){slip();say('VintedAuto-fejl: '+e.message)}
})();
`;
