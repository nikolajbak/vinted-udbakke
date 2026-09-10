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

async function open(id){
 await closeStray();
 var el=q('#'+id);if(!el)return null;
 el.click();
 for(var i=0;i<25;i++){var m=modal();if(m)return m;await sleep(120)}
 return null;
}

function filled(id){var e=q('#'+id);return !!(e&&norm(e.value))}

async function fillCategory(path){
 if(!path||!path.length)return 'kategori';
 var m=await open('category');if(!m)return 'kategori';
 for(var i=0;i<path.length;i++){
  var cur=modal();if(!cur)break;
  var before=norm(cur.textContent);
  var t=pick(cur,path[i]);
  if(!t)break; // AI'en gik dybere end Vinteds træ — behold det, vi nåede
  t.click();
  await waitChange(before,2500);
 }
 await save();await closeStray();
 return filled('category')?null:'kategori';
}

async function fillBrand(brand){
 if(!brand)return null;
 var m=await open('brand');if(!m)return 'mærke';
 var s=m.querySelector('#brand-search-input');
 if(s){s.focus();setv(s,brand);await sleep(1800)}
 var t=pick(modal()||m,brand);
 if(!t){await closeStray();return 'mærke'}
 t.click();await sleep(900);
 await save();await closeStray();
 return filled('brand')?null:'mærke';
}

async function fillSize(size,scale){
 if(!size)return null;
 var m=await open('size');if(!m)return 'størrelse';
 if(scale){var c=pick(m,scale);if(c){c.click();await sleep(800)}}
 var t=pick(modal()||m,size);
 if(!t){await closeStray();return 'størrelse'}
 t.click();await sleep(800);
 await save();await closeStray();
 return filled('size')?null:'størrelse';
}

async function fillPick(id,label,name){
 if(!label)return null;
 var m=await open(id);if(!m)return name;
 var t=pick(m,label);
 if(!t){await closeStray();return name}
 t.click();await sleep(800);
 await save();await closeStray();
 return filled(id)?null:name;
}

var t=q('#title'),de=q('#description'),pe=q('#price');
if(!t||!de||!pe){alert('Udbakke: du er ikke på opret-siden. Gå til Vinted → Sælg nu, og tryk på bogmærket der.');return}

try{
 var d=await(await fetch(API)).json();
 if(d.empty){alert('Udbakke: ingen klar udkast i køen.');return}

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

 // Kategorien først: resten af felterne findes ikke uden den.
 var mangler=[];
 var catFail=await fillCategory(d.categoryPath);
 if(catFail){
  mangler.push('kategori','mærke','størrelse','stand','farve');
 }else{
  var steps=[
   await fillBrand(d.brand),
   await fillSize(d.size,d.sizeScale),
   await fillPick('condition',d.condition,'stand'),
   await fillPick('color',d.color,'farve')
  ];
  steps.forEach(function(s){if(s)mangler.push(s)});
 }

 // Teksten til sidst, så ingen dialog kan nå at rydde den.
 setv(t,d.title);setv(de,d.description);setv(pe,price);

 alert('Udfyldt: '+d.title+'\n'+note+'.\n\n'+
  (mangler.length?'Sæt selv: '+mangler.join(', ')+'.\n':'Alle felter er sat.\n')+
  'Tilføj billeder, tjek annoncen og upload selv.');
}catch(e){alert('Udbakke-fejl: '+e.message)}
})();
`;
