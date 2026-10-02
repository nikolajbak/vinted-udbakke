/* Etiketarket, i en side for sig.

   window.print() goer INGENTING i den installerede app paa iOS — ingen fejl,
   intet panel. Derfor sender appen varerne hertil i adressens # (den naar
   aldrig serveren), og siden aabnes i rigtig Safari med x-safari-. Her kan
   der printes, og paa en Mac er det bare et nyt faneblad.

   #d= er JSON: { s: startplads (0-baseret), v: [[nr, titel, pris], …] }. */
(function(){
  'use strict';
  var APP_URL = 'https://nikolajbak.github.io/vinted-udbakke/';
  var PR_ARK = 21;
  var $ = function(id){ return document.getElementById(id); };
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function fmtNr(n){ return n ? '#' + String(n).padStart(4, '0') : ''; }

  // Samme kode som qrSvg i app.js — ret begge sammen. Margenen regnes i
  // samme enhed som cellSize, ikke i moduler: fire moduler = CELLE * 4.
  function qrSvg(tekst){
    var q = window.qrcode(0, 'M');
    q.addData(tekst);
    q.make();
    var CELLE = 4;
    return q.createSvgTag({ cellSize: CELLE, margin: CELLE * 4, scalable: true });
  }

  function besked(t){ $('etiket-besked').textContent = t; }

  var data = null;
  try{
    var m = location.hash.match(/[#&]d=([^&]*)/);
    if(m) data = JSON.parse(decodeURIComponent(m[1]));
  }catch(e){}
  if(!data || !data.v || !data.v.length){
    besked('Der er ingen etiketter at udskrive. Vælg dem i appen under Mere → Etiketter.');
    $('etiket-print').hidden = true;
    return;
  }
  if(!window.qrcode){
    besked('QR-koderne kunne ikke laves. Prøv igen, når du er online.');
    $('etiket-print').hidden = true;
    return;
  }

  // Et brugt etiketark har huller i toppen. Uden et startpunkt ville de
  // resterende etiketter blive printet oven i de tomme pladser.
  var start = Math.max(0, Math.min(PR_ARK - 1, parseInt(data.s, 10) || 0));
  var felter = [];
  for(var t = 0; t < start; t++) felter.push('<div class="etiket etiket-tom"></div>');
  data.v.forEach(function(d){
    felter.push('<div class="etiket">' +
      '<div class="etiket-qr">' + qrSvg(APP_URL + '#v' + d[0]) + '</div>' +
      '<div class="etiket-tekst">' +
        '<div class="etiket-nr">' + esc(fmtNr(d[0])) + '</div>' +
        '<div class="etiket-titel">' + esc(d[1] || '') + '</div>' +
        '<div class="etiket-pris">' + esc(d[2] || '') + '</div>' +
      '</div></div>');
  });

  // Arkene deles op her, ikke af browseren. En grid, der selv skal finde
  // sideskiftet, saetter foer eller siden en raekke hen over kanten.
  var ark = [];
  for(var i = 0; i < felter.length; i += PR_ARK){
    ark.push('<div class="ark-side">' + felter.slice(i, i + PR_ARK).join('') + '</div>');
  }
  var arkEl = $('ark');
  arkEl.innerHTML = ark.join('');

  // Eksemplet paa skaermen skaleres ned, saa et helt A4 kan ses paa telefonen.
  function skaler(){
    arkEl.style.zoom = '';
    var side = arkEl.firstChild;
    var b = side.offsetWidth + 32, plads = document.documentElement.clientWidth;
    if(b > plads) arkEl.style.zoom = String(plads / b);
  }
  skaler();
  window.addEventListener('resize', skaler);

  var n = data.v.length;
  besked(n + (n === 1 ? ' etiket' : ' etiketter') + ' på ' + ark.length + ' ark (A4, 3 × 7 af 63,5 × 38,1 mm).');
  $('etiket-print').addEventListener('click', function(){ window.print(); });
})();
