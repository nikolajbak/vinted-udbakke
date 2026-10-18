(function(){
  /* Appen må ikke zoome. iOS ignorerer user-scalable=no i viewporten, så
     knibet stoppes her; dobbelttrykket stoppes af touch-action i style.css. */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function(t){
    document.addEventListener(t, function(e){ e.preventDefault(); }, { passive: false });
  });
  var SUPABASE_URL = 'https://gjycsqshkvkcupdnvgvf.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqeWNzcXNoa3ZrY3VwZG52Z3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NjE0MDUsImV4cCI6MjEwNDUzNzQwNX0.hENgHUL5IJRDf13KdoyWrR4p3jhkcx176JESAWCQu34';
  var LOGIN_EMAIL = 'adgang@udbakke.local';
  var FILL_API = 'https://gjycsqshkvkcupdnvgvf.supabase.co/functions/v1/vinted-fill-script?key=a4deb2bc4156ae08d2772aca72de6a70';
  var BOOKMARKLET = "javascript:%28function%28%29%7Bvar%20A%3D%27https%3A%2F%2Fgjycsqshkvkcupdnvgvf.supabase.co%2Ffunctions%2Fv1%2Fvinted-fill-script%3Fkey%3Da4deb2bc4156ae08d2772aca72de6a70%27%3Bwindow.__UDBAKKE_API__%3DA%3Bfetch%28A%2B%27%26script%3D1%27%2C%7Bcache%3A%27no-store%27%7D%29.then%28function%28r%29%7Breturn%20r.text%28%29%7D%29.then%28function%28t%29%7B%280%2Ceval%29%28t%29%7D%29.catch%28function%28e%29%7Balert%28%27VintedAuto%3A%20kunne%20ikke%20hente%20scriptet%20-%20%27%2Be.message%29%7D%29%3B%7D%29%28%29%3B";

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var rows = {};
  var started = false;
  var currentId = null;
  var queueTegnet = false;

  // iOS og iPadOS er det eneste sted, x-safari- findes, og det eneste sted
  // kameraet aabner af sig selv. En iPad melder sig som Macintosh, saa
  // beroeringspunkterne afgoer den.
  var UA = navigator.userAgent || '';
  var PAA_IOS = /iPad|iPhone|iPod/.test(UA) ||
                (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);

  var $ = function(id){ return document.getElementById(id); };
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function relTime(iso){
    if(!iso) return '';
    var d = new Date(iso); if(isNaN(d)) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if(m < 1) return 'lige nu';
    if(m < 60) return 'for ' + m + ' min. siden';
    var h = Math.round(m/60);
    if(h < 24) return 'for ' + h + ' t. siden';
    return 'for ' + Math.round(h/24) + ' dage siden';
  }
  // Skelettet har listens form, saa der ikke staar en snurrende cirkel og
  // siger "vent" uden at sige hvad man venter paa - og saa siden ikke hopper,
  // naar indholdet lander.
  function visSkelet(el, n){
    var r = '';
    for(var i = 0; i < (n || 3); i++){
      r += '<div class="skel-row"><i></i><span class="skel-tekst">' +
           '<i></i><i></i><i></i></span></div>';
    }
    el.className = 'skel';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = r;
    el.hidden = false;
  }

  // En fejl er ikke en blindgyde. Foer stod der "Prøv at genindlæse" - altsaa
  // en instruks om at gaa uden om appen for at gentage det, appen selv lige
  // har forsoegt.
  function visFejl(el, overskrift, besked, igen){
    el.className = 'empty';
    el.removeAttribute('aria-hidden');
    el.hidden = false;
    el.innerHTML = '<h3>' + esc(overskrift) + '</h3><p>' + esc(besked) + '</p>';
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-secondary'; b.textContent = 'Prøv igen';
    b.addEventListener('click', igen);
    el.appendChild(b);
  }

  // Et lille ryk i telefonen — kun hvor browseren har navigator.vibrate
  // (Android). iOS giver intet ryk fra en webside: en kontakt, der slaas om
  // fra koden, er tavs (maalt 17. oktober, se CLAUDE.md).
  function ryst(ms){
    try{ if(navigator.vibrate) navigator.vibrate(ms || 10); }catch(e){}
  }

  function toast(msg){
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3200);
  }

  /* ---- Router ----------------------------------------------------------- */
  var stack = [];
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function screenEl(name){ return $('s-' + name); }

  // Browserens tilbageknap findes ikke i en PWA paa telefonen, saa den er
  // aldrig blevet savnet. I Safari paa en Mac findes den - og uden det her
  // ville Cmd+[ forlade appen midt i et udkast i stedet for at gaa ét skridt
  // tilbage. Stakken er stadig sandheden; historien er kun en skygge af den,
  // saa knappen har noget at gribe fat i.
  //
  // Et tal, ikke et flag: to hurtige tilbage-tryk ville ellers kunne dele det
  // samme flag, og det andet popstate blive laest som brugerens eget.
  var springer = 0;

  function skygge(erstat){
    try{
      if(erstat) history.replaceState({ udbakke: stack.length }, '');
      else history.pushState({ udbakke: stack.length }, '');
    }catch(e){}
  }

  function show(name, opts){
    opts = opts || {};
    stopScan();
    var next = screenEl(name);
    var cur = stack.length ? screenEl(stack[stack.length - 1]) : null;
    if(cur === next) return;
    if(opts.replace && stack.length) stack[stack.length-1] = name; else stack.push(name);
    if(RODER[name] && stack.length === 1) flytFanebar(name);
    // Kun naar vi gaar DYBERE. Bundskaermen skal ikke have sin egen post -
    // ellers kunne man ikke forlade appen med tilbageknappen igen.
    if(stack.length > 1) skygge(!!opts.replace);

    // Selvrettende: skjul enhver skærm der er synlig uden at være den, vi
    // kommer fra, så lag aldrig kan hobe sig op oven på hinanden.
    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function(el){
      if(el !== next && el !== cur) el.hidden = true;
    });

    next.hidden = false;
    if(reduce){ if(cur && cur !== next) cur.hidden = true; return; }

    next.classList.add(opts.fade ? 'enter-fade' : 'enter-right');
    void next.offsetWidth;   // tegn startpositionen, så overgangen ses
    next.classList.remove('enter-fade', 'enter-right');
    if(cur && cur !== next){
      cur.classList.add('exit-left');
      setTimeout(function(){ cur.hidden = true; cur.classList.remove('exit-left'); }, 280);
    }
  }

  function back(fraHistorik){
    if(stack.length < 2) return;
    stopScan();
    // Kom trykket fra appens egen pil, skal historien med tilbage. Kom det fra
    // browseren, har den allerede gjort sit.
    if(fraHistorik !== true){ springer++; try{ history.back(); }catch(e){ springer--; } }
    var cur = screenEl(stack.pop());
    var prev = screenEl(stack[stack.length - 1]);
    prev.hidden = false;
    if(reduce){ cur.hidden = true; return; }
    prev.classList.add('exit-left');
    void prev.offsetWidth;
    prev.classList.remove('exit-left');
    cur.classList.add('enter-right');
    setTimeout(function(){ cur.hidden = true; cur.classList.remove('enter-right'); }, 280);
  }

  /* ---- Fanerne i bunden ----------------------------------------------------
     Lager, Prisvagt, Konto og Mere er rødder: et skift dem imellem lægger
     ingen tilbagepil og ingen post i historien. Der er én fanebjælke; den
     flyttes ind i den skærm, der er fremme. */
  var RODER = { queue: 1, vagt: 1, konto: 1, menu: 1 };
  function flytFanebar(name){
    var nav = $('fanebar'), s = screenEl(name);
    if(!nav || !s) return;
    if(nav.parentNode !== s) s.appendChild(nav);
    Array.prototype.forEach.call(nav.querySelectorAll('[data-til]'), function(b){
      var on = b.getAttribute('data-til') === name;
      b.classList.toggle('on', on);
      if(on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }
  function hentFane(name){
    if(name === 'vagt') hentVagt();
    else if(name === 'konto') hentKonto();
    else if(name === 'menu') tegnTjek();
  }
  function skiftFane(name){
    var s = screenEl(name);
    if(stack.length === 1 && stack[0] === name){
      var b = s.querySelector('.body');
      if(b) b.scrollTop = 0;
      return;
    }
    stopScan();
    stack = [name];
    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function(el){
      el.classList.remove('enter-right', 'exit-left', 'enter-fade');
      el.hidden = el !== s;
    });
    flytFanebar(name);
    hentFane(name);
  }
  Array.prototype.forEach.call(document.querySelectorAll('#fanebar [data-til]'), function(b){
    b.addEventListener('click', function(){ skiftFane(b.getAttribute('data-til')); });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function(b){
    b.addEventListener('click', function(){ back(); });
  });

  window.addEventListener('popstate', function(){
    if(springer > 0){ springer--; return; }
    // Paa bundskaermen lader vi browseren goere sit, saa appen kan forlades.
    if(stack.length > 1) back(true);
  });

  // Escape er tilbage paa et tastatur. Ikke naar beskaeringen staar aaben -
  // dér har den sin egen Annullér, og skaermen bagved skal ikke skifte under
  // den.
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape' || e.defaultPrevented) return;
    if(!$('crop').hidden) return;
    if(stack.length > 1){ e.preventDefault(); back(); }
  });

  /* ---- Kø --------------------------------------------------------------- */
  // Tre prikker paa kortet: hvor har varen vaeret? Med én markedsplads var det
  // ligegyldigt; med tre er det dét, man skal kunne se uden at aabne udkastet.
  function markedsMaerker(d){
    if(d.status !== 'ny' && d.status !== 'afsendt') return '';
    var sendt = sendtTil(d);
    return '<span class="marks">' + MARKEDER.map(function(m){
      return '<i class="' + (sendt[m.k] ? 'on' : '') + '" title="' + esc(m.navn) + '"></i>';
    }).join('') + '</span>';
  }

  // Et kort i listen har altid tre linjer, i samme skrift og stoerrelse:
  //   1  maerke · varetype           loebenummer
  //   2  stoerrelse · farve · stand · materiale
  //   3  pris (eller hvor langt udkastet er)
  // En linje uden indhold faar et haardt mellemrum, saa alle kort er lige hoeje.
  function kortLinjer(d, linje3){
    var navn = [d.brand, d.category].filter(Boolean).join(' · ') || d.title ||
      (d.status === 'kladde' ? 'Ufærdig billedserie' : 'Nyt udkast');
    var detaljer = [d.size ? 'Str. ' + d.size : '', d.color, d.condition, d.material]
      .filter(Boolean).join(' · ');
    if(!detaljer){
      detaljer = d.status === 'kladde' ? (d.photos || []).length + ' billeder taget'
               : d.status === 'afventer' ? relTime(d.created_at) : '';
    }
    return '<span class="kort-l kort-l1"><span class="kort-navn">' + esc(navn) + '</span>' +
             '<span class="kort-nr">' + esc(fmtNr(d.nr)) + '</span></span>' +
           '<span class="kort-l kort-l2">' + (esc(detaljer) || '&nbsp;') + '</span>' +
           '<span class="kort-l kort-l3">' + (linje3 || '&nbsp;') + '</span>';
  }

  function kortPris(v){
    var n = prisTal(v);
    return isFinite(n) ? kr(n) : (v || '');
  }

  // En pris skrives som hele kroner med komma og to nuller: "89,00 kr".
  // Samme form som kr() i _shared/pris.ts.
  function kr(n){
    return Math.round(Number(n)) + ',00 kr';
  }

  function koeStatus(d){
    if(d.status === 'kladde') return 'Kladde';
    if(d.status === 'afventer'){
      return (d.price_note || '').indexOf('Analyse mislykkedes') === 0 ? 'Analysen mislykkedes' : 'Analyserer …';
    }
    return '';
  }

  /* ---- Swipe-til-slet ---------------------------------------------------
     Som i Mail: træk rækken til venstre, og kassér-knappen kommer frem. Slip
     et kort stykke inde, og den bliver stående, til du trykker. Træk den
     halvvejs over, og udkastet ryger med det samme.

     Pointer-hændelser frem for touch, så det også virker med en mus — og fordi
     touch-action: pan-y i stilarket allerede har givet browseren den lodrette
     scroll. Vi skal derfor aldrig kalde preventDefault og kan ikke komme til at
     låse siden fast under fingeren. */
  var ACTION_W = 108;
  var openSwipe = null;

  function closeSwipe(except){
    if(openSwipe && openSwipe !== except && openSwipe._shut) openSwipe._shut();
  }

  function wireSwipe(sw){
    var row = sw.querySelector('.row');
    var id = sw.getAttribute('data-id');
    var startX = 0, startY = 0, base = 0, dx = 0, sideways = false, live = false, decided = false;

    function place(x){ row.style.transform = x ? 'translateX(' + x + 'px)' : ''; }
    function shut(){ sw.classList.remove('is-open'); place(0); if(openSwipe === sw) openSwipe = null; }
    function bare(){ sw.classList.add('is-open'); place(-ACTION_W); openSwipe = sw; }
    sw._shut = shut;

    function discard(){
      var d = rows[id];
      if(!d) return;
      var previous = d.status;
      if(openSwipe === sw) openSwipe = null;
      place(-sw.offsetWidth);
      sw.classList.add('is-going');
      // Væk med det samme. Venter vi på serveren, føles det trægt, og
      // realtidskanalen sender alligevel den samme ændring bagefter.
      d.status = 'kasseret';
      setTimeout(renderQueue, reduce ? 0 : 190);
      sb.from('drafts').update({ status: 'kasseret' }).eq('id', id).then(function(res){
        if(res && res.error){
          d.status = previous;
          renderQueue();
          toast('Kunne ikke kassere udkastet');
          return;
        }
        undoToast(id, previous);
      });
    }

    sw.querySelector('.swipe-del').addEventListener('click', function(e){
      e.stopPropagation();
      discard();
    });

    row.addEventListener('pointerdown', function(e){
      if(e.pointerType === 'mouse' && e.button !== 0) return;
      base = sw.classList.contains('is-open') ? -ACTION_W : 0;
      startX = e.clientX; startY = e.clientY;
      dx = base; sideways = false; decided = false; live = true;
    });

    row.addEventListener('pointermove', function(e){
      if(!live) return;
      var mx = e.clientX - startX, my = e.clientY - startY;
      if(!decided){
        if(Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        decided = true;
        // Er bevægelsen mest lodret, er det en scroll. Slip den helt.
        if(Math.abs(mx) <= Math.abs(my)){ live = false; return; }
        sideways = true;
        closeSwipe(sw);
        sw.classList.add('is-dragging');
        if(row.setPointerCapture) row.setPointerCapture(e.pointerId);
      }
      dx = base + mx;
      // Den anden vej er der intet at hente, så trækket møder modstand.
      if(dx > 0) dx *= 0.25;
      place(dx);
    });

    function settle(){
      if(!live) return;
      live = false;
      sw.classList.remove('is-dragging');
      if(!sideways) return;
      // Trukket over halvdelen af rækken: det er ikke en tøven, det er et valg.
      if(-dx > sw.offsetWidth * 0.45){ discard(); return; }
      if(-dx > ACTION_W * 0.5) bare(); else shut();
      sw.setAttribute('data-swiped', '1');
      setTimeout(function(){ sw.removeAttribute('data-swiped'); }, 60);
    }
    row.addEventListener('pointerup', settle);
    row.addEventListener('pointercancel', function(){
      if(!live) return;
      live = false;
      sw.classList.remove('is-dragging');
      if(sideways){ if(sw.classList.contains('is-open')) bare(); else shut(); }
    });
  }

  // Et fejlswipe skal kunne fortrydes. Udkastet er kun markeret kasseret,
  // aldrig slettet, så det er ét kald at få det tilbage.
  function undoToast(id, previous, tekst){
    var t = document.createElement('div');
    t.className = 'toast toast-action';
    var label = document.createElement('span');
    label.textContent = tekst || 'Udkastet er kasseret';
    var undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Fortryd';
    undo.addEventListener('click', function(){
      t.remove();
      sb.from('drafts').update({ status: previous }).eq('id', id).then(function(){
        if(rows[id]) rows[id].status = previous;
        renderQueue();
      });
    });
    t.appendChild(label); t.appendChild(undo);
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 6000);
  }

  /* ---- Lageret -----------------------------------------------------------
     En vare har ÉT forloeb, og det regnes ud af det, der faktisk er sket —
     ikke af en status, du selv skal flytte. Foer stod 15 af 16 varer i "koeen",
     selv om de laa ude paa Vinted, og to af dem var solgt.

       klar   billederne er analyseret, varen er ikke sendt nogen steder hen
       ude    en aktiv annonce, eller sendt til en markedsplads
       solgt  annoncen er solgt eller taget ned

     Kladder og udkast under analyse staar under "klar". */
  function annoncer(d){ return (d && d.listings) || []; }
  function vintedAnnonce(d){
    return annoncer(d).filter(function(x){ return x.platform === 'vinted'; })[0] || null;
  }
  function fase(d){
    if(d.status === 'kladde' || d.status === 'afventer') return 'klar';
    var l = annoncer(d);
    if(l.some(function(x){ return x.status === 'solgt' || x.status === 'afsluttet'; }) &&
       !l.some(function(x){ return x.status === 'aktiv' || x.status === 'pause'; })) return 'solgt';
    if(l.length) return 'ude';
    // Uden en annonce (DBA, Reshopper, en Vinted-annonce der aldrig blev
    // tilknyttet) er "taget ned" det eneste, der siger, at varen er vaek.
    var s = sendtTil(d), ned = d.taget_ned || {};
    var sendteSteder = Object.keys(s).filter(function(k){ return s[k]; });
    if(sendteSteder.length && sendteSteder.every(function(k){ return ned[k]; })) return 'solgt';
    if(s.vinted || s.dba || s.reshopper || d.status === 'afsendt') return 'ude';
    return 'klar';
  }
  // Prisen, varen staar til NU: annoncens, hvis den er laest; ellers udkastets.
  function nuPris(d){
    var l = vintedAnnonce(d);
    var p = l && ((l.published && l.published.price) || l.price);
    return p ? prisTal(p) : prisTal(d.price);
  }
  function dageUde(l){
    if(!l || !l.listed_at) return null;
    var slut = l.sold_at ? new Date(l.sold_at).getTime() : Date.now();
    return Math.max(0, Math.round((slut - new Date(l.listed_at).getTime()) / 86400000));
  }

  // Uden et valg fra sidst aabner forsiden paa den foerste fane med noget i.
  var FANE = 'klar', FANE_VALGT = false;
  try{ FANE = localStorage.getItem('fane') || 'klar'; FANE_VALGT = !!localStorage.getItem('fane'); }catch(e){}
  if(['klar','ude','solgt'].indexOf(FANE) < 0) FANE = 'klar';

  Array.prototype.forEach.call(document.querySelectorAll('#faner [data-fane]'), function(b){
    b.addEventListener('click', function(){
      FANE = b.getAttribute('data-fane');
      FANE_VALGT = true;
      try{ localStorage.setItem('fane', FANE); }catch(e){}
      queueTegnet = false;
      renderQueue();
    });
  });

  // Tredje linje paa kortet: hvad der er vigtigt i netop den fase.
  function linjeTre(d){
    var f = fase(d);
    if(f === 'klar'){
      return d.status === 'ny' || d.status === 'afsendt'
        ? '<span class="kort-pris">' + esc(kortPris(d.price)) + '</span>' + markedsMaerker(d)
        : esc(koeStatus(d));
    }
    var l = vintedAnnonce(d);
    var n = nuPris(d);
    if(f === 'ude'){
      var dele = [];
      if(l){
        if(isFinite(n)) dele.push('<span class="kort-pris">' + esc(kr(n)) + '</span>');
        dele.push('<span class="kort-hjerter">♥ ' + esc(String(l.favourites || 0)) + '</span>');
        var dg = dageUde(l);
        if(dg !== null) dele.push(esc(dg + (dg === 1 ? ' dag' : ' dage')));
        if(venterFelter(l).length) dele.push('<span class="kort-vent">rettelse venter</span>');
        return dele.join(' · ') + markedsMaerker(d);
      }
      return (isFinite(n) ? '<span class="kort-pris">' + esc(kr(n)) + '</span> · ' : '') +
        'ikke bekræftet' + markedsMaerker(d);
    }
    // solgt
    var sl = annoncer(d).filter(function(x){ return x.status === 'solgt'; })[0];
    if(!sl) return 'taget ned';
    var dg2 = dageUde(sl);
    return (sl.sold_price != null
        ? '<span class="kort-pris">solgt for ' + esc(kr(sl.sold_price)) + '</span>'
        : '<span class="kort-vent">solgt · tast salgsprisen</span>') +
      (dg2 !== null ? ' · lå ' + esc(dg2 + (dg2 === 1 ? ' dag' : ' dage')) : '');
  }

  function sorterFase(f){
    return function(a, b){
      var ka, kb;
      if(f === 'ude'){
        ka = (vintedAnnonce(a) || {}).listed_at || a.created_at;
        kb = (vintedAnnonce(b) || {}).listed_at || b.created_at;
      } else if(f === 'solgt'){
        var sa = annoncer(a).filter(function(x){ return x.sold_at; })[0];
        var sb2 = annoncer(b).filter(function(x){ return x.sold_at; })[0];
        ka = (sa && sa.sold_at) || a.created_at; kb = (sb2 && sb2.sold_at) || b.created_at;
      } else { ka = a.created_at; kb = b.created_at; }
      return ka < kb ? 1 : -1;
    };
  }

  function renderQueue(){
    var alle = Object.keys(rows).map(function(k){ return rows[k]; })
      .filter(function(d){ return ['ny','afventer','kladde','afsendt'].indexOf(d.status) > -1; });
    var tal = { klar:0, ude:0, solgt:0 };
    alle.forEach(function(d){ tal[fase(d)]++; });
    if(!FANE_VALGT && !tal[FANE] && alle.length){
      FANE = ['klar','ude','solgt'].filter(function(f){ return tal[f]; })[0] || 'klar';
    }
    ['klar','ude','solgt'].forEach(function(f){
      $('tal-' + f).textContent = tal[f] ? String(tal[f]) : '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('#faner [data-fane]'), function(b){
      var on = b.getAttribute('data-fane') === FANE;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    tegnOpgaver(alle);

    var list = alle.filter(function(d){ return fase(d) === FANE; }).sort(sorterFase(FANE));

    $('queue-loading').hidden = true;
    var tom = $('queue-empty');
    tom.hidden = list.length > 0;
    if(!list.length){
      // Den tegnede tomme skaerm hoerer til "klar". De to andre faner siger
      // bare, hvad der kommer til at staa der.
      tom.querySelector('h3').textContent = FANE === 'klar' ? 'Intet klar til at blive lagt op'
        : FANE === 'ude' ? 'Intet ude lige nu' : 'Intet solgt endnu';
      tom.querySelector('p').innerHTML = FANE === 'klar'
        ? 'Tryk <b>Nyt produkt</b> og følg billedserien. Claude skriver annoncen ud fra billederne, og du gennemser den bagefter.'
        : FANE === 'ude' ? 'Når en vare er lagt op, flytter den hertil af sig selv.'
        : 'Solgte varer og varer, du har taget ned, samles her.';
    }

    var el = $('queue-list');
    el.innerHTML = list.map(function(d){
      var linje3 = linjeTre(d);
      // Kun det, der endnu ikke er ude, kan kasseres med et swipe. En vare
      // med en aktiv annonce skal tages ned, ikke glemmes.
      if(FANE !== 'klar'){
        return '<div class="swipe" data-id="' + esc(d.id) + '">' +
          '<button type="button" class="row" data-id="' + esc(d.id) + '">' +
          (d.image_url ? '<img src="' + esc(d.image_url) + '" alt="">' : '<span class="ph"></span>') +
          '<span class="row-main">' + kortLinjer(d, linje3) + '</span>' +
          '<span class="chev"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span>' +
          '</button></div>';
      }
      return '<div class="swipe" data-id="' + esc(d.id) + '">' +
        '<button type="button" class="swipe-del" tabindex="-1" aria-label="Kassér udkastet">' +
          '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>' +
          '<span>Kassér</span>' +
        '</button>' +
        '<button type="button" class="row' + (d.status !== 'ny' ? ' is-muted' : '') +
             '" data-id="' + esc(d.id) + '">' +
        (d.image_url ? '<img src="' + esc(d.image_url) + '" alt="">' : '<span class="ph"></span>') +
        '<span class="row-main">' + kortLinjer(d, linje3) + '</span>' +
        '<span class="chev"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span>' +
        '</button>' +
      '</div>';
    }).join('');

    // Koen tegnes om, hver gang et udkast skifter status. Uden det her ville
    // hele listen tone ind forfra ved hver realtidsopdatering.
    el.classList.toggle('er-ny', !queueTegnet);
    queueTegnet = true;

    Array.prototype.forEach.call(el.querySelectorAll('.row'), function(r){
      r.addEventListener('click', function(){
        var sw = r.parentNode;
        // Et klik falder altid efter et træk. Var det et træk, var det ikke
        // ment som et tryk.
        if(sw && sw.getAttribute('data-swiped')) return;
        // Står en række åben, lukker første tryk den — som i Mail.
        if(openSwipe){ closeSwipe(null); return; }
        var d = rows[r.getAttribute('data-id')];
        if(!d) return;
        if(d.status === 'kladde'){ resumeSession(d); return; }
        openDetail(d.id);
      });
    });

    Array.prototype.forEach.call(el.querySelectorAll('.swipe'), function(sw){
      if(sw.querySelector('.swipe-del')) wireSwipe(sw);
    });

    // Tegnes detaljen om midt i en indtastning, forsvinder det, du skrev.
    var fokus = document.activeElement;
    var skriver = fokus && /INPUT|TEXTAREA/.test(fokus.tagName) && $('d-body').contains(fokus);
    if(currentId && rows[currentId] && !screenEl('detail').hidden && !skriver) renderDetail();
  }

  /* ---- Det, der venter paa dig -------------------------------------------
     Forsiden siger selv, hvad der skal goeres. Foer laa det i Prisvagt, inde i
     en menu, der hed Indstillinger — og saa saa man det ikke. */
  // Vigtigst foerst: en vare, der kan saelges to gange, foer en salgspris,
  // der mangler.
  // En koeber, der venter paa svar, kommer lige efter en vare, der kan
  // saelges to gange.
  var OPGAVE_ORDEN = { ned:0, svar:1, forslag:2, fejl:3, send:4, salg:5, knyt:6 };
  var OPG_AABEN = false;
  function opgaveKort(tekst, under, knapper, slags){
    return { o: OPGAVE_ORDEN[slags], h: '<div class="opgave' + (slags === 'svar' ? ' opgave-svar' : '') + '">' +
      '<div class="opgave-tekst"><b>' + tekst + '</b>' + (under ? '<span>' + under + '</span>' : '') + '</div>' +
      '<div class="opgave-knapper">' + knapper + '</div></div>' };
  }
  function tegnOpgaver(alle){
    var kort = [];
    alle.forEach(function(d){
      var nr = esc(fmtNr(d.nr));
      var navn = esc(d.title || 'Varen');
      var sendt = sendtTil(d), ned = d.taget_ned || {};
      var solgtL = annoncer(d).filter(function(x){ return x.status === 'solgt'; })[0];

      // Solgt paa Vinted, men stadig ude paa DBA eller Reshopper: den kan
      // saelges to gange. Det vigtigste paa skaermen.
      if(solgtL){
        MARKEDER.forEach(function(m){
          if(m.k === 'vinted' || !sendt[m.k] || ned[m.k]) return;
          kort.push(opgaveKort(nr + ' er solgt — tag den ned på ' + esc(m.navn),
            navn + ' kan ellers blive solgt to gange.',
            '<button type="button" class="btn btn-secondary" data-op="aabn-' + m.k + '" data-id="' + esc(d.id) + '">Åbn ' + esc(m.navn) + '</button>' +
            '<button type="button" class="btn btn-primary" data-op="ned-' + m.k + '" data-id="' + esc(d.id) + '">Taget ned</button>', 'ned'));
        });
        if(solgtL.sold_price == null){
          kort.push(opgaveKort(nr + ' er solgt — hvad gik den for?', navn,
            '<button type="button" class="btn btn-secondary" data-op="vis" data-id="' + esc(d.id) + '">Tast pris</button>', 'salg'));
        }
      }
      annoncer(d).forEach(function(l){
        // Prisvagten saetter selv aendringerne, naar Vinted er aaben i Safari.
        // Kun en, der har ventet over et doegn, er din opgave.
        if((l.status === 'aktiv' || l.status === 'pause') && sidderFast(l) && l.external_id){
          var pv = l.pending && l.pending.price;
          kort.push(opgaveKort(nr + (pv ? ': ny pris ' + esc(kr(pv)) + ' er ikke nået ud' : ': din rettelse er ikke nået ud'),
            'Vinted har ikke været åben i Safari, så den er ikke sat endnu.',
            '<button type="button" class="btn btn-secondary" data-op="send" data-ext="' + esc(l.external_id) + '">Sæt nu</button>', 'send'));
        }
      });
      if(d.status === 'afventer' && (d.price_note || '').indexOf('Analyse mislykkedes') === 0){
        kort.push(opgaveKort(nr + ': analysen mislykkedes', '',
          '<button type="button" class="btn btn-secondary" data-op="vis" data-id="' + esc(d.id) + '">Se</button>', 'fejl'));
      }
      // Sendt til Vinted for over en time siden, men ingen annonce fundet.
      // Efterloebet plejer at finde den; goer det ikke, er adressen vejen ind.
      if(sendt.vinted && !vintedAnnonce(d) && Date.now() - new Date(sendt.vinted).getTime() > 3600000){
        kort.push(opgaveKort(nr + ' er ikke knyttet til sin annonce',
          'Uden den ser appen hverken pris, hjerter eller salg.',
          '<button type="button" class="btn btn-secondary" data-op="vis" data-id="' + esc(d.id) + '">Tilknyt</button>', 'knyt'));
      }
    });
    // Koeberbeskeder fra Vinteds mails, med koeber-assistentens udkast.
    // Afsendelsen er dit tryk: kopiér, aabn samtalen, saet ind (bestemt af dig).
    SVAR.forEach(function(k){
      var under = k.buyer_message ? '»' + esc(k.buyer_message) + '«' : 'Mailen viste ikke beskeden — se den på Vinted.';
      var forslag = '';
      if(k.counter_price) forslag += '<b>Modbud: ' + esc(kr(k.counter_price)) + '</b> ';
      if(k.intent === 'accept') forslag += '<b>Tag imod buddet</b> ';
      if(k.reply) forslag += esc(k.reply);
      else if(k.intent === 'defer') forslag += 'Det kan kun du svare på.';
      if(forslag) under += '<span class="svar-forslag">' + forslag + '</span>';
      var id = ' data-svar="' + esc(String(k.id)) + '"';
      kort.push(opgaveKort('Køber skriver om ' + esc(k.item_title || 'en vare'), under,
        (k.reply ? '<button type="button" class="btn btn-primary" data-op="svar-kopier"' + id + '>Kopiér svaret</button>' : '') +
        (k.samtale ? '<button type="button" class="btn btn-secondary" data-op="svar-aabn"' + id + '>Åbn samtalen</button>' : '') +
        '<button type="button" class="btn btn-secondary" data-op="svar-klaret"' + id + '>Klaret</button>', 'svar'));
    });
    // Prisvagten foreslaar kun (bestemt af dig 18. oktober). Én opgave for
    // dem alle — selve listen staar paa Prisvagt-skaermen.
    var nf = 0;
    alle.forEach(function(d){ annoncer(d).forEach(function(l){ if(harForslag(l)) nf++; }); });
    if(nf){
      kort.push(opgaveKort(nf + (nf === 1 ? ' prisforslag venter' : ' prisforslag venter') + ' på din godkendelse',
        'Prisvagten sætter ingen pris ned, før du har sagt ja.',
        '<button type="button" class="btn btn-primary" data-op="forslag">Se forslagene</button>', 'forslag'));
    }
    kort.sort(function(a, b){ return a.o - b.o; });
    var el = $('opgaver');
    // Den vigtigste staar altid fremme; resten ligger bag ét baand, saa
    // forsiden ikke bliver en vaeg af opgaver foer lageret.
    var h = kort.length ? kort[0].h : '';
    if(kort.length > 1){
      h += '<details class="opg-baand"' + (OPG_AABEN ? ' open' : '') + '><summary>' +
        '<span>' + (kort.length - 1) + ' ting mere venter på dig</span>' +
        '<span class="chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span></summary>' +
        kort.slice(1).map(function(k){ return k.h; }).join('') + '</details>';
    }
    el.innerHTML = h;
    var baand = el.querySelector('.opg-baand');
    if(baand) baand.addEventListener('toggle', function(){ OPG_AABEN = baand.open; });
    Array.prototype.forEach.call(el.querySelectorAll('[data-op]'), function(b){
      b.addEventListener('click', function(){ opgave(b.getAttribute('data-op'), b); });
    });
  }

  var MARKED_FORSIDE = { dba: 'https://www.dba.dk/', reshopper: 'reshopper://' };
  function opgave(op, b){
    var d = rows[b.getAttribute('data-id')];
    var ext = b.getAttribute('data-ext');
    var svar = SVAR.filter(function(k){ return String(k.id) === b.getAttribute('data-svar'); })[0];
    if(op === 'svar-kopier' && svar){
      if(navigator.clipboard) navigator.clipboard.writeText(svar.reply).then(function(){ toast('Svaret er kopieret'); });
      return;
    }
    if(op === 'svar-aabn' && svar){ aabnUdad(svar.samtale); return; }
    if(op === 'svar-klaret' && svar){
      SVAR = SVAR.filter(function(k){ return k !== svar; });
      renderQueue();
      sb.from('koeber_beskeder').update({ besvaret_at: new Date().toISOString() }).eq('id', svar.id).then(function(res){
        if(res.error) toast('Kunne ikke gemme: ' + res.error.message);
      });
      return;
    }
    if(op === 'vis' && d){ openDetail(d.id); return; }
    if(op === 'forslag'){ skiftFane('vagt'); return; }
    if(op === 'send'){ aabnUdad('https://www.vinted.dk/items/' + ext + '/edit#udbakke=send'); return; }
    if(op.indexOf('aabn-') === 0){
      var k = op.slice(5);
      if(k === 'reshopper'){
        if(PAA_IOS) window.location.href = 'reshopper://';
        else toast('Reshopper findes kun som app — tag den ned på telefonen');
      } else aabnUdad(MARKED_FORSIDE[k]);
      return;
    }
    if(op.indexOf('ned-') === 0 && d){ tagetNed(d, op.slice(4)); }
  }

  // Varen er taget ned paa en plads. Det kan fortrydes paa varens side.
  function tagetNed(d, key){
    var ned = Object.assign({}, d.taget_ned || {});
    ned[key] = new Date().toISOString();
    d.taget_ned = ned;
    renderQueue();
    sb.from('drafts').update({ taget_ned: ned }).eq('id', d.id).then(function(res){
      if(res.error){ toast('Kunne ikke gemme: ' + res.error.message); return; }
      toast('Noteret: taget ned på ' + markedsNavn(key));
    });
  }

  /* ---- Detalje ---------------------------------------------------------- */
  function openDetail(id){ currentId = id; renderDetail(); show('detail'); hentAnnoncer(id); }

  // Varens side: billeder, prisen den staar til NU, hvad modellen har udfyldt,
  // og en raekke pr. markedsplads. Hvor varen er, staar i raekken — ikke som
  // maerker, du selv skal pille af igen.
  var FOLD = {};   // varens side: er »Tekst og detaljer« foldet ud, pr. vare
  function renderDetail(){
    var d = rows[currentId];
    if(!d) return;
    $('d-title').textContent = d.title || 'Udkast';
    $('d-nr').textContent = fmtNr(d.nr);
    var photos = d.photos || [];
    var failed = (d.price_note || '').indexOf('Analyse mislykkedes') === 0;
    var f = fase(d);
    var faerdig = d.status === 'ny' || d.status === 'afsendt';

    var html = '';
    var gal = photos.length ? photos : (d.image_url ? [{ url: d.image_url, kind: '' }] : []);
    if(gal.length){
      html += '<div class="gallery"><div class="hero-track" id="d-track">' +
        gal.map(function(p){ return '<img class="hero" src="' + esc(p.url) + '" alt="' + esc(p.kind || '') + '">'; }).join('') +
        '</div>' +
        (gal.length > 1 ? '<div class="dots" id="d-dots">' + gal.map(function(_, i){
          return '<i class="' + (i === 0 ? 'on' : '') + '"></i>';
        }).join('') + '</div>' : '') +
      '</div>';
    }
    if(photos.length){
      // Numrene og »Forside« staar kun fremme, naar billederne kan flyttes
      // — saa kan man se, hvor et billede lander (flytbarStribe).
      html += '<div class="strip' + (faerdig ? ' flytbar' : '') + '" id="d-strip">' + photos.map(function(p, i){
        return '<div class="strip-cel" data-i="' + i + '"><img src="' + esc(p.url) + '" alt="' + esc(p.kind || '') + '" draggable="false">' +
          (faerdig ? '<b class="strip-nr">' + (i === 0 ? 'Forside' : i + 1) + '</b>' : '') + '</div>';
      }).join('') + '</div>';
      if(faerdig) html += '<div class="flyt-vis" id="d-flyt-vis" aria-live="polite"></div>';
      html += '<div class="note">Tryk på et lille billede for at beskære det' +
        (faerdig ? ' · hold fingeren på det og træk for at flytte det' : '') + '.</div>';
    }

    if(faerdig){
      // Det store tal er det, varen koster NU. Staar der 175 i udkastet og
      // 149 paa Vinted, er det 149.
      var l = vintedAnnonce(d);
      var live = l && ((l.published && l.published.price) || l.price);
      var n = nuPris(d), udkast = prisTal(d.price);
      html += '<div class="price-row"><span class="price-big mono">' +
        esc(isFinite(n) ? kr(n) : (d.price || '?')) + '</span>' +
        (live ? '<span class="chip chip-ny">Vinted</span>' : '') +
        (!live && f === 'klar' && d.price_grounded === false ? '<span class="chip chip-vent">Foreløbig</span>' : '') +
        (live && isFinite(udkast) && udkast !== n ? '<span class="pris-foer">udkast: ' + esc(kr(udkast)) + '</span>' : '') +
        '</div>';
      var under = [d.size, d.color, d.condition].filter(Boolean).join(' · ');
      if(under) html += '<div class="d-under">' + esc(under) + '</div>';
      if(!live && f === 'klar' && d.price_grounded === false){
        html += '<div class="note">Prisen er et skøn. Den tjekkes mod rigtige annoncer, når du udfylder på Vinted.</div>';
      }
      html += '<div class="sect plads-gruppe"><span class="label">Markedspladser</span>' +
        MARKEDER.map(function(m){ return pladsRaekke(d, m, f); }).join('') + '</div>';
      // Teksten og det udfyldte er til gennemsyn, foer varen sendes afsted:
      // aaben, mens varen er klar, ellers klappet sammen. Dit valg huskes.
      var aaben = FOLD[d.id] !== undefined ? FOLD[d.id] : f === 'klar';
      html += '<details class="fold" id="d-fold"' + (aaben ? ' open' : '') + '><summary>Tekst og detaljer' +
        '<span class="chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span></summary>' +
        (d.price_note && f === 'klar' ? '<div class="note">' + esc(d.price_note) + '</div>' : '') +
        faktaListe(d, f) +
        (d.description ? '<div class="desc">' + esc(d.description) + '</div>' : '') +
        '<div class="note note-luft">Oprettet ' + esc(relTime(d.created_at)) + '</div></details>';
    } else if(failed){
      html += '<div class="warn">' + esc(d.price_note) + '</div>';
    } else if(d.status === 'kladde'){
      html += '<div class="note note-luft">Billedserien er ikke færdig.</div>';
    } else {
      html += '<div class="note note-luft">Claude analyserer billederne og skriver udkastet. Det tager typisk under et minut.</div>';
    }

    if(d.personal_info){
      html += '<div class="warn">Der blev fundet personlige oplysninger på et af billederne — fx et påsyet navnemærke — og de er automatisk maskeret. Tjek billederne, før du uploader.</div>';
    }
    if(!faerdig) html += '<div class="note note-luft">' + esc(relTime(d.created_at)) + '</div>';

    // Hjaelpehandlingerne. "Kassér" kun, hvor varen ikke er ude: en aktiv
    // annonce skal tages ned, ikke glemmes i appen, mens den staar paa Vinted.
    html += '<div class="sect">';
    if(faerdig){
      html += '<button type="button" class="btn btn-secondary" data-a="edit">' +
              (f === 'klar' ? 'Redigér udkast' : 'Redigér annonce') + '</button>' +
              '<div class="knap-par"><button type="button" class="btn btn-quiet" data-a="save">Gem billeder i Fotos</button>' +
              '<button type="button" class="btn btn-quiet" data-a="copy">Kopiér tekst</button></div>';
    }
    if(f === 'klar'){
      html += '<button type="button" class="btn btn-danger" data-a="discard">Kassér udkast</button>';
    } else if(f === 'solgt'){
      html += '<button type="button" class="btn btn-danger" data-a="discard">Fjern fra listen</button>';
    }
    html += '</div>';
    $('d-body').innerHTML = html;
    var fold = $('d-fold');
    if(fold) fold.addEventListener('toggle', function(){ FOLD[d.id] = fold.open; });

    var track = $('d-track'), dots = $('d-dots');
    if(track && dots){
      track.addEventListener('scroll', function(){
        var i = Math.round(track.scrollLeft / track.clientWidth);
        Array.prototype.forEach.call(dots.children, function(dot, n){
          dot.classList.toggle('on', n === i);
        });
      }, { passive: true });
    }

    var strip = $('d-strip');
    if(strip){
      strip.addEventListener('click', function(e){
        if(strip.__netFlyttet){ strip.__netFlyttet = false; return; }
        var c = e.target.closest && e.target.closest('.strip-cel');
        if(c) openCrop(d, Number(c.getAttribute('data-i')));
      });
      // Under analysen skriver serveren billederne pr. plads (ét kald pr.
      // foto); en flytning dér ville lande paa de forkerte pladser.
      if(faerdig) flytbarStribe(strip, d);
    }

    // Foden: de tre markedspladser, saa laenge varen ikke er ude nogen steder.
    // Derefter bor handlingerne i markedspladsens egen raekke.
    var fod = '';
    if(faerdig && f === 'klar'){
      var sendt = sendtTil(d);
      fod += '<div class="market-row">' + MARKEDER.map(function(m){
        return '<button type="button" class="btn btn-market' + (sendt[m.k] ? ' is-done' : '') +
          '" data-a="' + m.a + '">' + esc(m.navn) + '</button>';
      }).join('') + '</div>';
    } else if(failed){
      fod += '<button type="button" class="btn btn-primary" data-a="retry">Prøv analysen igen</button>';
    }
    $('d-footer').innerHTML = fod;
    $('d-footer').hidden = !fod;

    Array.prototype.forEach.call(
      document.querySelectorAll('#d-footer [data-a], #d-body [data-a]'), function(b){
        b.addEventListener('click', function(){ detailAction(b.getAttribute('data-a'), d, b); });
      });
    Array.prototype.forEach.call($('d-body').querySelectorAll('[data-aabn]'), function(b){
      b.addEventListener('click', function(){ aabnUdad(b.getAttribute('data-aabn')); });
    });
    var felt = $('d-body').querySelector('[data-knyt="felt"]');
    var gem = $('d-body').querySelector('[data-knyt="gem"]');
    if(felt && gem) gem.addEventListener('click', function(){ tilknytAnnonce(d, felt); });
    Array.prototype.forEach.call($('d-body').querySelectorAll('[data-salg]'), function(b){
      b.addEventListener('click', function(){
        var l = annoncer(d).filter(function(x){ return x.id === b.getAttribute('data-salg'); })[0];
        var kr = prisTal(b.parentNode.querySelector('.salg-pris').value);
        if(!l) return;
        if(!isFinite(kr) || kr <= 0){ toast('Skriv prisen i hele kroner'); return; }
        b.disabled = true;
        markerSolgt(l, kr).then(function(){ b.disabled = false; });
      });
    });
  }

  // Det, modellen har udfyldt, og hvor sikkert det er. Nr. 19 kom ud som
  // beige til 35 kr; med farvens kilde og den manglende nypris paa skaermen
  // var det set paa to sekunder.
  function faktaListe(d, f){
    var fk = d.fakta || {};
    var ny = !!fk.ny || /^ny/i.test(d.condition || '');
    var r = '';
    function rk(navn, v, hale, adv){
      if(!v && !hale) return;
      r += '<div class="ud-rk"><span class="ud-k">' + esc(navn) + '</span>' +
        '<span class="ud-v">' + esc(v || '—') + '</span>' +
        (hale ? '<span class="ud-h' + (adv ? ' adv' : ' ok') + '">' + esc(hale) + '</span>' : '') + '</div>';
    }
    rk('Mærke', d.brand);
    rk('Størrelse', d.size);
    rk('Farve', d.color, fk.maerkeFarve ? 'fra mærket: ' + fk.maerkeFarve : (d.color ? 'skønnet ud fra billedet' : ''), !fk.maerkeFarve);
    rk('Stand', d.condition);
    rk('Materiale', d.material, fk.materialer ? 'vaskemærket: ' + fk.materialer : '');
    rk('Kategori', d.category);
    if(fk.dele && fk.dele.length) rk('Dele', fk.dele.join(' + '));
    // Varens egen produktside er fundamentet for teksten (_shared/beskrivelse.ts).
    if(fk.produktNavn){
      var vaert = ''; try { vaert = new URL(fk.produktside).hostname.replace(/^www\./, ''); } catch(e){}
      rk('Produkt', fk.produktNavn, vaert ? 'fra ' + vaert : 'fundet på nettet');
    }
    if(ny){
      var np = prisTal(fk.nypris);
      rk('Nypris', isFinite(np) ? kr(np) : '', isFinite(np) ? (fk.nyprisKilde || '') : 'ikke fundet — prisen er ikke målt mod nyprisen', !isFinite(np));
    }
    if(fk.maal) rk('Mål', fk.maal, fk.maalKilde || '');
    // Vinteds felter »Længde« og »Skulderbredde«: plaggets egne mål i cm.
    if(fk.laengde || fk.skulderbredde) rk('Til Vinteds mål',
      [fk.laengde ? 'længde ' + fk.laengde + ' cm' : '', fk.skulderbredde ? 'skulderbredde ' + fk.skulderbredde + ' cm' : '']
        .filter(Boolean).join(' · '), fk.plagMaalKilde || '');
    if(!r) return '';
    return '<div class="fakta"><span class="label">Det, der udfyldes</span>' +
      '<div class="udgivet-liste">' + r + '</div></div>';
  }

  // En raekke pr. markedsplads: hvor er varen, og hvad kan du goere dér.
  function pladsVagt(l){
    if(harForslag(l)) return 'Prisvagt: foreslår ' + kr(l.forslag.price) + ' — venter på din godkendelse under Prisvagt';
    var pv = l.pending && l.pending.price;
    if(pv) return 'Prisvagt: ny pris ' + kr(pv) + ' på vej — ' +
      (sidderFast(l) ? 'Vinted har ikke været åben i Safari' : 'sættes, næste gang Vinted er åben');
    if(l.status === 'pause') return 'Prisvagt: på pause';
    if(!l.auto) return 'Prisvagt: sætter ikke længere ned' + (l.note ? ' — ' + l.note : '');
    return 'Prisvagt: ' + (l.last_check_at ? 'tjekket ' + relTime(l.last_check_at) : 'ikke tjekket endnu') +
      (l.next_check_at ? ' · ' + omDage(l.next_check_at) : '');
  }
  function pladsRaekke(d, m, f){
    var sendt = sendtTil(d)[m.k], ned = (d.taget_ned || {})[m.k];
    var l = annoncer(d).filter(function(x){ return x.platform === m.k; })[0];
    var solgtVinted = annoncer(d).some(function(x){ return x.platform === 'vinted' && x.status === 'solgt'; });
    var status = '', krop = '';

    if(l){
      var dg = dageUde(l);
      if(l.status === 'solgt'){
        status = l.sold_price != null ? 'Solgt for ' + kr(l.sold_price) : 'Solgt';
        if(l.sold_price == null){
          krop += '<div class="vagt-forslag"><b>Hvad gik den for?</b>' +
            '<span>Tast prisen, også hvis du tog imod et bud — det er den, appen lærer af.</span>' +
            '<div class="salg-form"><input type="number" inputmode="numeric" min="1" class="salg-pris" ' +
            'placeholder="' + esc(String(l.price || '')) + '" aria-label="Salgspris i kroner">' +
            '<button type="button" class="btn btn-primary" data-salg="' + esc(l.id) + '">Gem</button></div></div>';
        }
      } else if(l.status === 'afsluttet'){
        status = 'Taget ned';
      } else {
        status = l.status === 'pause' ? 'Ude · prisvagten holder pause' : 'Ude';
        krop += '<div class="plads-tal">♥ ' + esc(String(l.favourites || 0)) +
          (dg !== null ? ' · ' + dg + (dg === 1 ? ' dag' : ' dage') : '') + '</div>';
        // Prisvagten paa selve varen: hvad den sidst gjorde, og hvad der sker.
        if(l.platform === 'vinted') krop += '<div class="plads-vagt">' + esc(pladsVagt(l)) + '</div>';
      }
      krop += udgivetBlok(l, d);
      if(l.status === 'aktiv' || l.status === 'pause'){
        krop += '<details class="vagt-mere"><summary>Solgt eller taget ned?</summary>' +
          '<div class="salg-form"><input type="number" inputmode="numeric" min="1" class="salg-pris" ' +
          'placeholder="' + esc(String(l.price || '')) + '" aria-label="Salgspris i kroner">' +
          '<button type="button" class="btn btn-primary" data-salg="' + esc(l.id) + '">Solgt for det</button></div>' +
          '<button type="button" class="btn btn-quiet" data-a="afslut-' + esc(l.id) + '">Taget ned uden salg</button>' +
          '</details>';
      }
    } else if(ned){
      status = 'Taget ned ' + relTime(ned);
      krop += '<button type="button" class="btn btn-quiet" data-a="fortryd-ned-' + m.k + '">Fortryd</button>';
    } else if(sendt){
      status = m.k === 'vinted' ? 'Sendt ' + relTime(sendt) + ' · ikke bekræftet' : 'Sendt ' + relTime(sendt);
      if(solgtVinted && m.k !== 'vinted'){
        krop += '<div class="warn">Solgt på Vinted — tag den ned her, så den ikke sælges to gange.</div>' +
          '<button type="button" class="btn btn-primary" data-a="ned-' + m.k + '">Taget ned</button>';
      }
      if(m.k === 'vinted') krop += knytBlok();
      // Uden en annonce kender appen ikke salget; det skal kunne siges her.
      if(!solgtVinted){
        krop += '<button type="button" class="btn btn-secondary" data-a="ned-' + m.k + '">Solgt eller taget ned</button>';
      }
      if(f !== 'klar' && !solgtVinted){
        krop += '<button type="button" class="btn btn-secondary" data-a="' + m.a + '">' +
          (m.k === 'vinted' ? 'Udfyld igen' : 'Fortsæt på ' + esc(m.navn)) + '</button>';
      }
      // Et maerke sat ved en fejl skal kunne tages af igen. Knappen paa
      // markedspladsen kan ikke selv vaere fortrydelsen: et tryk dér AABNER
      // markedspladsen og armerer automatikken.
      krop += '<button type="button" class="btn btn-quiet" data-a="fjern-' + m.k + '">Ikke sendt alligevel</button>';
    } else {
      status = 'Ikke lagt op';
      if(f !== 'klar' && !solgtVinted){
        krop += '<button type="button" class="btn btn-secondary" data-a="' + m.a + '">Læg op på ' + esc(m.navn) + '</button>';
      }
    }
    return '<div class="plads"><div class="plads-top"><span class="plads-navn">' + esc(m.navn) + '</span>' +
      '<span class="plads-status">' + esc(status) + '</span></div>' + krop + '</div>';
  }

  // Annoncerne for varen hentes friske, naar siden aabnes: kortet i listen kan
  // vaere hentet for laenge siden.
  function hentAnnoncer(id){
    sb.from('listings').select(ANNONCE_FELTER).eq('draft_id', id).then(function(res){
      if(res.error || !rows[id]) return;
      rows[id].listings = res.data || [];
      if(currentId === id && !screenEl('detail').hidden) renderDetail();
    });
  }

  // Salgsprisen er det, der kan laeres af. Udbudsprisen er ikke svaret: et bud,
  // du tog imod, ligger under den.
  function markerSolgt(l, kr){
    var nyt = l.status !== 'solgt';
    var patch = { sold_price: kr };
    if(nyt){
      patch.status = 'solgt'; patch.sold_at = new Date().toISOString();
      patch.pending = null; patch.pending_note = null;
    }
    return sb.from('listings').update(patch).eq('id', l.id).then(function(res){
      if(res.error){ toast('Kunne ikke gemme: ' + res.error.message); return; }
      if(nyt){
        sb.from('price_events').insert({ listing_id: l.id, kind:'solgt', price: kr,
          from_price: l.price, favourites: l.favourites, note:'markeret solgt i appen' }).then(function(){});
      }
      Object.keys(patch).forEach(function(k){ l[k] = patch[k]; });
      toast(nyt ? 'Flyttet til solgt' : 'Salgsprisen er gemt');
      // Et salg er ny viden; gennemgangen siger selv til, hvis det er for tidligt.
      laerNu(true);
      renderQueue();
      if(currentId && !screenEl('detail').hidden) renderDetail();
      if(!screenEl('vagt').hidden) hentVagt();
    });
  }

  // En annonce, der ikke er lagt op gennem appens udfyldning, findes ikke i
  // `listings` — og saa naar hverken annoncens egne ord, prisvagten eller et
  // "solgt" nogensinde tilbage til udkastet. Raekken oprettes ét sted, af
  // runneren, naar den selv saa varen blive lagt op. Alt andet — en annonce
  // skrevet i haanden, en fra foer appen, en hvor Upload ikke naaede at melde
  // tilbage — stod uden for. Adressen er det eneste, der mangler.
  function knytBlok(){
    return '<div class="udgivet"><span class="label">Ingen annonce tilknyttet</span>' +
      '<p class="note">Er varen lagt op uden appens udfyldning, kender appen ikke ' +
      'annoncen. Indsæt dens adresse — så kan appen læse, hvad der står i den, ' +
      'og prisvagten kan følge den.</p>' +
      '<input class="ud-knyt" type="url" inputmode="url" autocapitalize="off" ' +
      'autocorrect="off" spellcheck="false" data-knyt="felt" ' +
      'aria-label="Annoncens adresse på Vinted" ' +
      'placeholder="https://www.vinted.dk/items/…">' +
      '<button type="button" class="btn btn-secondary" data-knyt="gem">Tilknyt annonce</button></div>';
  }

  // Vinteds adresser hedder /items/6789012345-nike-jakke. Kun nummeret betyder
  // noget; resten er noget, Vinted selv haenger paa. Et bart nummer maa ogsaa
  // kunne indsaettes — det er dét, der staar, hvis det er kopieret fra et
  // andet felt end adresselinjen.
  function annonceNummer(s){
    var t = String(s || '').trim();
    var m = t.match(/\/items\/(\d+)/) || t.match(/^(\d{4,})$/);
    return m ? m[1] : '';
  }

  function tilknytAnnonce(d, felt){
    var nr = annonceNummer(felt.value);
    if(!nr){
      toast('Indsæt annoncens adresse fra Vinted — fx https://www.vinted.dk/items/1234567890-…');
      felt.focus();
      return;
    }
    // Prisvagten regner ud fra udbudsprisen, og `listings` kan ikke oprettes
    // uden. Annoncens EGEN pris laeses et oejeblik efter, naar "Opdatér"
    // aabner den — praecis som runneren goer, naar den selv registrerer.
    var pris = prisTal(d && d.price);
    if(!(pris > 0)){
      toast('Udkastet har ingen pris. Sæt den først — prisvagten regner fra den.');
      return;
    }
    var url = 'https://www.vinted.dk/items/' + nr;
    sb.from('listings').insert({
      draft_id: d.id, platform: 'vinted', external_id: nr, url: url,
      title: d.title || '', search_query: d.search_query || d.title || '',
      price: pris, start_price: pris,
      next_check_at: new Date(Date.now() + 7 * 86400000).toISOString()
    }).select('id').single().then(function(res){
      if(res.error){
        // Det unikke indeks paa (platform, external_id) er det, der fanger en
        // annonce, som allerede hoerer til et andet udkast.
        toast(res.error.code === '23505'
          ? 'Den annonce er allerede tilknyttet et udkast.'
          : 'Kunne ikke tilknytte annoncen: ' + (res.error.message || 'ukendt fejl'));
        return;
      }
      sb.from('price_events').insert({
        listing_id: res.data.id, kind: 'oprettet', price: pris,
        note: 'tilknyttet i appen'
      }).then(function(){});
      markerSendt(d, 'vinted');
      toast('Annoncen er tilknyttet. Tryk Opdatér, så læser appen den.');
      renderDetail(); renderQueue();
      hentAnnoncer(d.id);
    });
  }

  function markedsNavn(k){
    return (MARKEDER.filter(function(m){ return m.k === k; })[0] || {}).navn || k;
  }
  // Samme tekst med et ekstra mellemrum eller et stort begyndelsesbogstav er
  // ikke en aendring. Uden den oprydning ville halvdelen af felterne staa som
  // "aendret", hver gang Vinted normaliserede noget.
  function ensLyd(a, b){
    var n = function(x){ return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toLowerCase(); };
    return n(a) === n(b);
  }

  var UDGIVET_FELTER = [
    { k:'title',       navn:'Titel',       u:'title' },
    { k:'description', navn:'Beskrivelse', u:'description' },
    { k:'brand',       navn:'Mærke',       u:'brand' },
    { k:'size',        navn:'Størrelse',   u:'size' },
    { k:'condition',   navn:'Stand',       u:'condition' },
    { k:'color',       navn:'Farve',       u:'color' }
  ];

  function udgivetBlok(x, d){
    var navn = markedsNavn(x.platform);
    var p = x.published || null;
    // Markedspladsens navn staar allerede i raekken, udgivetBlok ligger i.
    var h = '<div class="udgivet">';

    // Ventende rettelser staar oeverst: det er det eneste her, der kraever
    // noget af dig. Resten er til orientering.
    var venter = venterFelter(x);
    if(venter.length && x.external_id && x.platform === 'vinted'){
      h += '<div class="vagt-forslag"><b>Venter på at komme ud: ' + esc(venter.join(', ')) + '</b>' +
        (x.pending_note ? '<span>' + esc(x.pending_note) + '</span>' : '') +
        '<button type="button" class="btn btn-primary" data-aabn="' +
        esc('https://www.vinted.dk/items/' + x.external_id + '/edit#udbakke=send') +
        '">Send til ' + esc(navn) + '</button></div>';
    }

    if(!p){
      h += '<p class="note">Annoncens egne oplysninger er ikke læst endnu. ' +
           'Tryk <b>Opdatér</b> — så åbner annoncen, og appen læser den.</p>';
    } else {
      var raekker = '';
      // Prisen staar altid: den er det, der oftest bliver rettet, og den er
      // det, du skal kunne se uden at aabne Vinted.
      if(p.price){
        var udkast = prisTal(d && d.price);
        raekker += udgivetRaekke('Pris', kr(p.price),
          (isFinite(udkast) && udkast !== p.price) ? 'udkast: ' + kr(udkast) : '');
      }
      var aendret = 0;
      UDGIVET_FELTER.forEach(function(f){
        var v = p[f.u];
        if(!v) return;
        if(ensLyd(v, d && d[f.k])) return;
        aendret++;
        raekker += udgivetRaekke(f.navn, v, 'ændret');
      });
      h += '<div class="udgivet-liste">' + raekker + '</div>';
      if(!aendret) h += '<p class="note">Resten står, som det blev sendt afsted.</p>';
      h += '<p class="note">Aflæst ' + esc(relTime(x.synced_at)) +
           (p.kilde === 'side' ? ' fra annoncesiden' : '') + '.</p>';
    }

    // En solgt eller lukket annonce har intet nyt at sige.
    if(x.external_id && x.platform === 'vinted' && (x.status === 'aktiv' || x.status === 'pause' || !x.status)){
      h += '<button type="button" class="btn btn-quiet" data-aabn="' +
           esc('https://www.vinted.dk/items/' + x.external_id + '#udbakke=synk') +
           '">Opdatér fra ' + esc(navn) + '</button>';
    }
    if(x.url){
      h += '<button type="button" class="btn btn-secondary" data-aabn="' + esc(x.url) + '">' +
           'Åbn på ' + esc(navn) +
           (x.status === 'solgt' ? ' · solgt' : (x.price ? ' · ' + kr(x.price) : '')) +
           '</button>';
    }
    return h + '</div>';
  }

  function udgivetRaekke(navn, vaerdi, hale){
    return '<div class="ud-rk"><span class="ud-k">' + esc(navn) + '</span>' +
           '<span class="ud-v">' + esc(vaerdi) + '</span>' +
           (hale ? '<span class="ud-h">' + esc(hale) + '</span>' : '') + '</div>';
  }

  // Kom du tilbage fra Vinted, er der sandsynligvis noget nyt at hente. Uden
  // det her ville skaermen staa med gamle tal, til man selv gik ud og ind
  // igen — og saa ligner synkroniseringen noget, der ikke virker.
  document.addEventListener('visibilitychange', function(){
    if(document.hidden || !started) return;
    hentKoe(true);
    // Kvitteringen fra Vinted rydder rettelsen paa serveren; uden det her
    // stod den stadig som "klar", til du gik ud af skaermen og ind igen.
    if(!screenEl('vagt').hidden) hentVagt();
    if(!currentId || screenEl('detail').hidden) return;
    hentAnnoncer(currentId);
  });

  // Et tryk paa en markedsplads noterer, at varen er sendt DERHEN. Det er ikke
  // det samme som at den ER lagt op — kun Vinted-scriptet kan bekraefte det —
  // men det er dét, der skal til for at kunne se, hvad man mangler. Du kan
  // altid trykke igen — og fjerne maerket igen under "Markeret som sendt til".
  function markerSendt(d, key){
    var sendt = sendtTil(d);
    if(sendt[key]) return;
    sendt[key] = new Date().toISOString();
    d.posted_to = sendt;
    sb.from('drafts').update({ posted_to: sendt }).eq('id', d.id).then(function(){});
  }

  // Et maerke sat ved en fejl skal kunne tages af igen. Knappen paa
  // markedspladsen kan ikke selv vaere fortrydelsen: et tryk dér AABNER
  // markedspladsen og armerer automatikken, saa "tryk igen for at fjerne"
  // ville fylde en formular ud, hver gang man ville rette en afkrydsning.
  function fjernMaerke(d, key){
    var sendt = sendtTil(d);
    if(!sendt[key]) return;
    delete sendt[key];
    d.posted_to = sendt;
    sb.from('drafts').update({ posted_to: sendt }).eq('id', d.id).then(function(){
      renderDetail(); renderQueue();
    });
  }

  // Paa iOS tvinger x-safari- adressen ud i RIGTIG Safari. Uden det aabner
  // den inde i PWAens egen webvisning, hvor hverken Userscripts-udvidelsen
  // eller markedspladsernes universal links findes.
  //
  // Paa en Mac findes den ordning ikke, og den er heller ikke noedvendig: dér
  // er appen bare et faneblad, og svaret er et nyt faneblad. Vinduet skal
  // aabnes MENS klikket staar paa - venter vi paa databasen foerst, spaerrer
  // Safari det som et pop op.
  //
  // Svarer `foerst` med false, er turen aflyst: det, der skulle derud, blev
  // aldrig gemt. Saa lukkes det tomme faneblad igen.
  function aabnUdad(url, foerst){
    var vent = foerst || Promise.resolve();
    if(PAA_IOS){
      var iosGaa = function(v){ if(v !== false) window.location.href = 'x-safari-' + url; };
      vent.then(iosGaa, iosGaa);
      return;
    }
    var vindue = window.open('about:blank', '_blank');
    var gaa = function(v){
      if(v === false){ if(vindue && !vindue.closed) vindue.close(); return; }
      // Blev fanebladet spaerret alligevel, gaar vi selv derhen.
      if(vindue && !vindue.closed) vindue.location = url;
      else window.location.href = url;
    };
    vent.then(gaa, gaa);
  }

  function aabnMarked(d, btn, key, navn, url){
    var tekst = btn.textContent;
    btn.disabled = true; btn.textContent = 'Åbner …';
    markerSendt(d, key);
    // Automatikken henter kun udkast med status "ny". Et gammelt "afsendt"
    // ville ellers svare tomt, og formularen bliver staaende uudfyldt.
    var opd = { selected_at: new Date().toISOString() };
    if(d.status === 'afsendt'){ opd.status = 'ny'; d.status = 'ny'; }
    aabnUdad(url, sb.from('drafts').update(opd).eq('id', d.id));
    setTimeout(function(){ btn.disabled = false; btn.textContent = tekst; }, 2500);
  }

  function detailAction(a, d, btn){
    if(a === 'edit'){ aabnRedigering(d); }
    else if(a === 'fill'){
      aabnMarked(d, btn, 'vinted', 'Vinted', 'https://www.vinted.dk/items/new');
    }
    else if(a === 'dba'){
      aabnMarked(d, btn, 'dba', 'DBA', 'https://www.dba.dk/create-item/start');
    }
    else if(a === 'reshopper'){ markerSendt(d, 'reshopper'); reshopper(d, btn); }
    else if(a === 'copy'){
      // Prisen er den, varen staar til nu — ikke den, udkastet engang sagde.
      var n = nuPris(d);
      var text = [d.title, d.description, isFinite(n) ? 'Pris: ' + kr(n) : ''].filter(Boolean).join('\n\n');
      if(navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ toast('Teksten er kopieret'); });
    }
    else if(a === 'save') savePhotos(d, btn);
    else if(a.indexOf('fjern-') === 0){
      fjernMaerke(d, a.slice(6));
      toast('Markeringen er fjernet');
    }
    else if(a.indexOf('ned-') === 0){ tagetNed(d, a.slice(4)); renderDetail(); }
    else if(a.indexOf('fortryd-ned-') === 0){
      var ned = Object.assign({}, d.taget_ned || {});
      delete ned[a.slice(12)];
      d.taget_ned = ned;
      sb.from('drafts').update({ taget_ned: ned }).eq('id', d.id).then(function(){ renderQueue(); renderDetail(); });
    }
    else if(a.indexOf('afslut-') === 0){
      var l = annoncer(d).filter(function(x){ return x.id === a.slice(7); })[0];
      if(!l) return;
      btn.disabled = true;
      sb.from('listings').update({ status: 'afsluttet', pending: null, pending_note: null })
        .eq('id', l.id).then(function(res){
          if(res.error){ btn.disabled = false; toast('Kunne ikke gemme: ' + res.error.message); return; }
          sb.from('price_events').insert({ listing_id: l.id, kind: 'afsluttet', price: l.price,
            note: 'taget ned uden salg' }).then(function(){});
          l.status = 'afsluttet';
          toast('Flyttet til solgt — taget ned');
          renderQueue(); renderDetail();
        });
    }
    else if(a === 'discard'){
      // Samme fortrydelse som et swipe. Udkastet markeres kun kasseret.
      var foer = d.status;
      var besked = fase(d) === 'klar' ? 'Udkastet er kasseret' : 'Fjernet fra listen';
      sb.from('drafts').update({ status: 'kasseret' }).eq('id', d.id).then(function(res){
        if(res.error){ d.status = foer; renderQueue(); toast('Kunne ikke fjerne: ' + res.error.message); return; }
        undoToast(d.id, foer, besked);
      });
      d.status = 'kasseret';
      renderQueue();
      back();
    }
    else if(a === 'retry'){
      btn.disabled = true; btn.textContent = 'Starter …';
      sb.from('drafts').update({ status: 'kladde', price_note: null }).eq('id', d.id).then(function(){
        return sb.from('drafts').update({ status: 'afventer' }).eq('id', d.id);
      });
    }
  }

  // Billederne fra kameraet lander aldrig i kamerarullen — iOS giver dem
  // direkte til siden. Delingsarket har "Gem billeder", som tager alle på én gang.
  /* ---- Reshopper ---------------------------------------------------------
     Reshopper opretter kun varer fra deres egen app — der er ingen webformular
     at udfylde, som der er på Vinted. Så langt vi kan komme er at lægge
     annoncen færdig i DERES felter og rækkefølge, så indtastningen bliver ren
     afskrift frem for at skulle skrives forfra.

     De korte felter læses én gang og tastes; kun overskrift og beskrivelse
     kopieres, for hvert kopieret felt koster et skift frem og tilbage. */
  var RESHOPPER_API = FILL_API.replace('vinted-fill-script', 'reshopper-draft');
  var DBA_API = FILL_API.replace('vinted-fill-script', 'dba-fill-script');
  var PUSH_SUB_API = FILL_API.replace('vinted-fill-script', 'push-subscribe');
  var VAPID_PUBLIC = 'BMp994zMZHBAr9aT92AhhbdjYBB_wsE4vAX3DVk0uMjYOLMepNHI-V9C6cxmvj2N5iyrBuKjFEAh-GQ6-t4hbnw';
  // base64url -> Uint8Array, som applicationServerKey kraever.
  function vapidBytes(b64){
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g,'+').replace(/_/g,'/'));
    var arr = new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  // Web-push virker kun i en installeret PWA paa iOS, og kun i sikker kontekst.
  function pushMuligt(){
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  // De tre markedspladser ét sted, saa kø, detalje og handling ikke kan komme
  // til at sige noget forskelligt om den samme vare.
  var MARKEDER = [
    { k:'vinted',    navn:'Vinted',    a:'fill' },
    { k:'dba',       navn:'DBA',       a:'dba' },
    { k:'reshopper', navn:'Reshopper', a:'reshopper' }
  ];
  function sendtTil(d){ return (d && d.posted_to) || {}; }

  var SEGMENT = { kids:'Børn', women:'Mor', home:'Bolig' };
  var KATEGORI = { shoes:'Sko', clothes:'Tøj', toys:'Legetøj', gear:'Udstyr', furniture:'Møbler',
    garden:'Have', bikes:'Cykler', booksAndMedia:'Bøger og medier', maternity:'Gravid',
    misc:'Diverse', accessories:'Tilbehør', interior:'Indretning' };
  var STAND = { brandNew:'Ny med mærke', new:'Ny uden mærke', used:'Brugt', broken:'Defekt' };
  var KOEN = { boy:'Dreng', girl:'Pige' };

  function reshopper(d, btn){
    btn.disabled = true; btn.textContent = 'Klargør …';
    fetch(RESHOPPER_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id })
    }).then(function(r){ return r.json(); }).then(function(r){
      btn.disabled = false; btn.textContent = 'Reshopper';
      if(!r || r.error){ toast('Kunne ikke klargøre: ' + ((r && r.error) || 'ukendt fejl')); return; }
      visReshopper(d, r);
      // Billederne skal ligge i kamerarullen, INDEN Reshopper-appen åbnes —
      // ellers står man i deres billedvælger med en tom rulle.
      savePhotos(d, null);
    }).catch(function(){
      btn.disabled = false; btn.textContent = 'Reshopper';
      toast('Kunne ikke klargøre');
    });
  }

  var RS_VIS = null;  // lytteren der peger på næste tekstfelt, når du kommer tilbage

  function visReshopper(d, r){
    // Kun to ting skal på klippebordet: overskriften og beskrivelsen. Resten er
    // vælgere og korte tal — dem taster du hurtigere direkte, end du kan skifte
    // app for at indsætte dem. Klippebordet holder kun én ting ad gangen, så
    // hvert kopieret felt koster en tur frem og tilbage; det er turene, ikke
    // tastningen, der tager tiden.
    var vaelg = [
      ['Afdeling', SEGMENT[r.segment] || r.segment],
      ['Kategori', KATEGORI[r.category] || r.category],
      ['Mærke', r.brandOrTitle],
      ['Størrelse', r.size],
      ['Alder', r.age],
      ['Køn', KOEN[r.gender] || ''],
      ['Stand', STAND[r.conditionType] || r.conditionType],
      ['Pris', r.priceInKroner ? kr(r.priceInKroner) : '']
    ].filter(function(f){ return f[1]; });

    var tekst = [
      ['Overskrift', r.description],
      ['Beskrivelse', r.extendedDescription]
    ].filter(function(f){ return f[1]; });

    // Hvor langt du er, huskes pr. udkast. Bliver du afbrudt midt i, kan du se
    // hvad der mangler i stedet for at begynde forfra.
    var noegle = 'rs-taget-' + d.id, taget = {};
    try { taget = JSON.parse(localStorage.getItem(noegle) || '{}'); } catch(e){}

    var html = '<div class="sect"><span class="label">Til Reshopper</span>' +
      '<p class="note">Billederne er på vej i kamerarullen. Læs de korte felter ' +
      'én gang og tast dem i Reshopper — kun de to nederste skal kopieres.</p>' +
      '<div class="rs-list">' + vaelg.map(function(f){
        return '<div class="rs-li"><span class="rs-k">' + esc(f[0]) + '</span>' +
          '<span class="rs-v">' + esc(f[1]) + '</span></div>';
      }).join('') + '</div>' +
      tekst.map(function(f, i){
        return '<button type="button" class="rs-row' + (taget[f[0]] ? ' is-done' : '') +
          '" data-k="' + esc(f[0]) + '" data-v="' + esc(f[1]) + '">' +
          '<span class="rs-k">' + esc(i + 1) + '. ' + esc(f[0]) + ' — tryk for at kopiere</span>' +
          '<span class="rs-v">' + esc(f[1]) + '</span></button>';
      }).join('') +
      '<button type="button" class="btn btn-primary" id="rs-open">Åbn Reshopper</button>' +
      '<button type="button" class="btn btn-quiet" id="rs-reset">Nulstil afkrydsning</button></div>';

    var gammel = document.getElementById('rs-blok');
    if(gammel) gammel.remove();
    if(RS_VIS){ document.removeEventListener('visibilitychange', RS_VIS); RS_VIS = null; }
    var wrap = document.createElement('div');
    wrap.id = 'rs-blok'; wrap.innerHTML = html;
    $('d-body').appendChild(wrap);
    function gem(){ try { localStorage.setItem(noegle, JSON.stringify(taget)); } catch(e){} }
    function naeste(){ return wrap.querySelector('.rs-row:not(.is-done)'); }

    // Peger på det næste, der mangler. Kopierer IKKE af sig selv: Safari giver
    // kun adgang til klippebordet under et tryk, og et felt, der lagde sig på
    // klippebordet uden du bad om det, ville skubbe det forrige ud, før du nåede
    // at sætte det ind.
    function peg(){
      Array.prototype.forEach.call(wrap.querySelectorAll('.rs-row'), function(x){ x.classList.remove('is-next'); });
      var n = naeste();
      if(n){ n.classList.add('is-next'); n.scrollIntoView({ behavior:'smooth', block:'center' }); }
    }

    function kopier(b){
      if(!navigator.clipboard) return Promise.reject();
      return navigator.clipboard.writeText(b.getAttribute('data-v')).then(function(){
        b.classList.add('is-done'); b.classList.remove('is-next');
        taget[b.getAttribute('data-k')] = 1; gem();
      });
    }

    Array.prototype.forEach.call(wrap.querySelectorAll('.rs-row'), function(b){
      b.addEventListener('click', function(){ kopier(b).then(peg, function(){}); });
    });

    // reshopper:// er deres egen adresse — den står i appens Info.plist.
    // Findes appen ikke, sker der ingenting, så vi falder tilbage på App Store.
    wrap.querySelector('#rs-open').addEventListener('click', function(){
      // Tag det første tekstfelt med over. Trykket her ER brugerhandlingen,
      // så klippebordet må skrives — så slipper du for en tur tilbage efter det.
      var n = naeste();
      var aabn = function(){
        // Reshopper findes kun til telefonen. Paa en Mac ville deeplinket
        // ingenting goere, og App Store-faldgruben ville aabne en side om en
        // app, man ikke kan hente dér.
        if(!PAA_IOS){ toast('Reshopper findes kun som app — teksten er kopieret'); return; }
        var t = Date.now();
        window.location.href = 'reshopper://';
        setTimeout(function(){
          if(Date.now() - t < 1500) window.location.href = 'https://apps.apple.com/dk/app/reshopper/id551998942';
        }, 800);
      };
      if(n) kopier(n).then(aabn, aabn); else aabn();
    });

    wrap.querySelector('#rs-reset').addEventListener('click', function(){
      taget = {}; gem();
      Array.prototype.forEach.call(wrap.querySelectorAll('.rs-row'), function(x){ x.classList.remove('is-done'); });
      peg();
      toast('Afkrydsningen er nulstillet');
    });

    RS_VIS = function(){
      if(document.visibilityState === 'visible' && document.body.contains(wrap)) peg();
    };
    document.addEventListener('visibilitychange', RS_VIS);

    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function savePhotos(d, btn){
    var photos = d.photos || [];
    if(!photos.length) return Promise.resolve();
    // Kaldes både fra knappen og fra Reshopper-flowet, hvor der ikke er nogen
    // knap at slå fra.
    var label = btn && btn.textContent;
    if(btn){ btn.disabled = true; btn.textContent = 'Henter billeder …'; }
    Promise.all(photos.map(function(p, i){
      return fetch(p.url).then(function(r){ return r.blob(); }).then(function(b){
        return new File([b], (i+1) + '-' + (p.kind || 'billede') + '.jpg', { type: 'image/jpeg' });
      });
    })).then(function(files){
      if(navigator.canShare && navigator.canShare({ files: files })){
        return navigator.share({ files: files, title: d.title || 'Vinted-billeder' });
      }
      // Paa en Mac er der intet delingsark med "Gem billeder". Dér er svaret
      // en almindelig overfoersel. De forskydes, fordi Safari ellers kun
      // tager den foerste.
      if(!PAA_IOS){
        files.forEach(function(f, i){
          setTimeout(function(){
            var a = document.createElement('a');
            a.href = URL.createObjectURL(f);
            a.download = f.name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function(){ URL.revokeObjectURL(a.href); }, 10000);
          }, i * 250);
        });
        toast(files.length + ' billeder lægges i Overførsler');
        return;
      }
      toast('Hold fingeren på et billede og vælg "Føj til Fotos"');
    }).catch(function(){}).then(function(){
      if(btn){ btn.disabled = false; btn.textContent = label; }
    });
  }

  /* ---- Optagelse -------------------------------------------------------- */
  // Rammeguiden. iOS' eget kamera kan ikke faa et overlay paa - en webside maa
  // ikke tegne oven paa systemkameraet - saa guiden staar paa skaermen lige
  // FOER du trykker, i stedet for inde i soegeren.
  var G_HEL = '<svg class="guide" viewBox="0 0 90 120" aria-hidden="true">' +
    '<rect class="ramme" x="5" y="5" width="80" height="110" rx="4"/>' +
    '<path class="vare" d="M30 22 L22 30 L22 52 L28 52 L28 98 L62 98 L62 52 L68 52 L68 30 L60 22 L52 26 L38 26 Z"/>' +
    '</svg>';
  var G_NAER = '<svg class="guide" viewBox="0 0 90 120" aria-hidden="true">' +
    '<rect class="ramme" x="5" y="5" width="80" height="110" rx="4"/>' +
    '<rect class="vare" x="24" y="44" width="42" height="32" rx="3"/>' +
    '</svg>';
  var G_SLID = '<svg class="guide" viewBox="0 0 90 120" aria-hidden="true">' +
    '<rect class="ramme" x="5" y="5" width="80" height="110" rx="4"/>' +
    '<rect class="vare" x="20" y="38" width="50" height="44" rx="3"/>' +
    '<ellipse class="rod" cx="45" cy="60" rx="11" ry="8"/>' +
    '</svg>';

  var STEPS = [
    { kind:'forfra', title:'Forfra', guide:G_HEL, hint:'Hele varen lige forfra, med lidt luft hele vejen rundt. Hold fødder, sengekant og møbler ude af billedet — det bliver coverbilledet, folk ser i søgeresultater.' },
    { kind:'bagfra', title:'Bagfra', guide:G_HEL, hint:'Hele varen set bagfra, samme afstand som forfra.' },
    { kind:'maerke', title:'Mærket', guide:G_NAER, hint:'Nærbillede af brandmærket med luft omkring. Hold det vandret, så teksten kan læses.' },
    { kind:'stoerrelsesmaerke', title:'Størrelses- og vaskemærke', guide:G_NAER, hint:'Mærkatet med størrelse og materiale, vandret så teksten kan læses. Købere filtrerer på størrelse.' },
    { kind:'detalje', title:'Detalje', guide:G_NAER, hint:'Stof, tryk, lynlås eller knapper tæt på — med luft omkring, så intet skæres af kanten.' },
    { kind:'slid', title:'Slid eller fejl', guide:G_SLID, hint:'Kun hvis der er noget. Hold fejlen midt i billedet. Ærlighed her giver færre tvister — spring over hvis varen er fejlfri.' }
  ];
  var session = null;

  function renderCapture(){
    if(!session) return;
    var i = session.step, step = STEPS[i];
    $('cap-count').textContent = step ? ('Billede ' + (i+1) + ' af ' + STEPS.length) : 'Klar til udkast';
    $('cap-title').textContent = step ? step.title : 'Alle billeder taget';
    $('cap-hint').textContent = step ? step.hint : 'Du kan tage flere billeder, eller lave udkastet nu.';
    $('cap-guide').innerHTML = step && step.guide ? step.guide : '';
    $('cap-guide').hidden = !(step && step.guide);
    $('cap-skip').hidden = !step;
    $('cap-faerdig').hidden = session.photos.length === 0;
    $('cap-progress').innerHTML = STEPS.map(function(_, n){
      return '<i class="' + (n < i ? 'done' : n === i ? 'now' : '') + '"></i>';
    }).join('');
    $('cap-shots').innerHTML = session.photos.map(function(p){
      return '<div class="shot"><img src="' + esc(p.url) + '" alt=""><span>' + esc(p.kind) + '</span></div>';
    }).join('');
  }

  function startSession(){ session = { id:null, step:0, photos:[] }; renderCapture(); show('capture'); }
  // Naeste vare i samme omgang: skaermen staar, serien starter forfra. Det
  // forrige udkast skrives imens i baggrunden.
  function naesteVare(){
    session = { id:null, step:0, photos:[] };
    renderCapture();
    var st = $('cap-status');
    st.hidden = false; st.textContent = 'Den forrige vare skrives nu. Tag billeder af den næste.';
  }
  function resumeSession(d){
    session = { id: d.id, step: Math.min((d.photos||[]).length, STEPS.length), photos: d.photos || [] };
    renderCapture(); show('capture');
  }

  function shrink(file, maxDim, q){
    return new Promise(function(res, rej){
      var fr = new FileReader();
      fr.onerror = function(){ rej(new Error('read')); };
      fr.onload = function(e){
        var img = new Image();
        img.onerror = function(){ rej(new Error('decode')); };
        img.onload = function(){
          // Hele billedet uploades; beskæringen sker på serveren, hvor en model
          // kan se hvor varen er.
          var sc = Math.min(1, maxDim / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function(b){ b ? res(b) : rej(new Error('blob')); }, 'image/jpeg', q);
        };
        img.src = e.target.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function handleShot(file){
    if(!session) return Promise.resolve();
    var step = STEPS[session.step];
    var kind = step ? step.kind : 'ekstra';
    var st = $('cap-status');
    st.hidden = false; st.textContent = 'Uploader …';
    $('cap-shoot').disabled = true;

    return shrink(file, 1800, 0.9).then(function(blob){
      var path = 'draft-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg';
      return sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }).then(function(r){
        if(r.error) throw r.error;
        var url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
        session.photos.push({ path: path, url: url, kind: kind });
        if(!session.id){
          // Kladden oprettes først nu, så et afbrudt forsøg ikke efterlader en tom række.
          return sb.from('drafts').insert({
            status: 'kladde', photos: session.photos,
            image_path: path, image_url: url, created_at: new Date().toISOString()
          }).select('id').single().then(function(r2){
            if(r2.error) throw r2.error;
            session.id = r2.data.id;
          });
        }
        var patch = { photos: session.photos };
        if(session.photos.length === 1){ patch.image_path = path; patch.image_url = url; }
        return sb.from('drafts').update(patch).eq('id', session.id).then(function(r3){
          if(r3.error) throw r3.error;
        });
      });
    }).then(function(){
      if(session.step < STEPS.length) session.step++;
      st.hidden = true; $('cap-shoot').disabled = false;
      renderCapture();
    }).catch(function(){
      st.textContent = 'Kunne ikke gemme billedet. Prøv igen.';
      $('cap-shoot').disabled = false;
    });
  }

  $('new-btn').addEventListener('click', startSession);
  if(!PAA_IOS){
    // capture beder om kameraet. En Mac har ikke det kamera, og Safari
    // ignorerer attributten - men saa skal knappen heller ikke love et tryk.
    $('cam').removeAttribute('capture');
    $('cap-shoot').textContent = 'Vælg billeder';
    $('cap-pick').hidden = true;
  }
  // Paa en Mac er der ikke noget kamera at vaelge imellem: knappen vaelger
  // filer, og saa gerne flere ad gangen.
  $('cap-shoot').addEventListener('click', function(){ $(PAA_IOS ? 'cam' : 'cam-fotos').click(); });
  $('cap-pick').addEventListener('click', function(){ $('cam-fotos').click(); });
  // Flere billeder fra Fotos paa én gang. De fordeles paa trinene i den
  // raekkefoelge, de er valgt: foerst forfra, saa bagfra, saa maerket …
  $('cam-fotos').addEventListener('change', function(){
    var filer = Array.prototype.slice.call($('cam-fotos').files || []);
    $('cam-fotos').value = '';
    var kaede = Promise.resolve();
    filer.forEach(function(f){ kaede = kaede.then(function(){ return handleShot(f); }); });
  });
  $('cap-skip').addEventListener('click', function(){
    if(session && session.step < STEPS.length){ session.step++; renderCapture(); }
  });
  $('cam').addEventListener('change', function(){
    var f = $('cam').files && $('cam').files[0];
    $('cam').value = '';
    if(f) handleShot(f);
  });
  function lavUdkast(b, naeste){
    if(!session || !session.id) return;
    var tekst = b.textContent;
    b.disabled = true; b.textContent = 'Sender …';
    sb.from('drafts').update({ status: 'afventer' }).eq('id', session.id).then(function(res){
      b.disabled = false; b.textContent = tekst;
      if(res && res.error){ toast('Kunne ikke sende: ' + res.error.message); return; }
      if(naeste){ naesteVare(); return; }
      session = null; back(); toast('Udkastet skrives nu');
    });
  }
  $('cap-finish').addEventListener('click', function(){ lavUdkast($('cap-finish'), false); });
  $('cap-next').addEventListener('click', function(){ lavUdkast($('cap-next'), true); });
  $('cap-close').addEventListener('click', function(){
    if(session && session.id && session.photos.length){
      back(); toast('Gemt som ufærdig — du kan fortsætte senere');
    } else if(session && session.id){
      sb.from('drafts').update({ status: 'kasseret' }).eq('id', session.id); back();
    } else back();
    session = null;
  });

  /* ---- Beskæring -------------------------------------------------------- */
  var crop = null;
  function layoutBox(){
    if(!crop || !crop.rect) return;
    var r = crop.rect, f = crop.frame, b = $('crop-box');
    b.style.left = (f.left + r.x) + 'px'; b.style.top = (f.top + r.y) + 'px';
    b.style.width = r.w + 'px'; b.style.height = r.h + 'px';
  }
  function openCrop(d, i){
    var p = (d.photos || [])[i]; if(!p) return;
    crop = { draft: d, i: i, rect: null, frame: null, rot: 0 };
    $('crop').hidden = false;
    $('crop-img').onload = function(){
      var s = $('crop-stage').getBoundingClientRect(), im = $('crop-img').getBoundingClientRect();
      crop.frame = { left: im.left - s.left, top: im.top - s.top, w: im.width, h: im.height };
      crop.rect = { x:0, y:0, w: im.width, h: im.height };
      layoutBox();
    };
    $('crop-img').src = p.url;
  }
  function pos(e){
    var t = e.touches ? e.touches[0] : e, s = $('crop-stage').getBoundingClientRect();
    return { x: t.clientX - s.left, y: t.clientY - s.top };
  }
  function drag(e, corner){
    if(!crop || !crop.rect) return;
    e.preventDefault();
    var start = pos(e), r0 = { x:crop.rect.x, y:crop.rect.y, w:crop.rect.w, h:crop.rect.h };
    var f = crop.frame, MIN = 44;
    function move(ev){
      var p = pos(ev), dx = p.x - start.x, dy = p.y - start.y;
      var r = { x:r0.x, y:r0.y, w:r0.w, h:r0.h };
      if(!corner){
        r.x = Math.max(0, Math.min(f.w - r.w, r0.x + dx));
        r.y = Math.max(0, Math.min(f.h - r.h, r0.y + dy));
      } else {
        if(corner.indexOf('w') > -1){ var nx = Math.max(0, Math.min(r0.x + r0.w - MIN, r0.x + dx)); r.w = r0.w + (r0.x - nx); r.x = nx; }
        if(corner.indexOf('e') > -1){ r.w = Math.max(MIN, Math.min(f.w - r0.x, r0.w + dx)); }
        if(corner.indexOf('n') > -1){ var ny = Math.max(0, Math.min(r0.y + r0.h - MIN, r0.y + dy)); r.h = r0.h + (r0.y - ny); r.y = ny; }
        if(corner.indexOf('s') > -1){ r.h = Math.max(MIN, Math.min(f.h - r0.y, r0.h + dy)); }
      }
      crop.rect = r; layoutBox(); ev.preventDefault();
    }
    function end(){
      document.removeEventListener('mousemove', move); document.removeEventListener('touchmove', move);
      document.removeEventListener('mouseup', end); document.removeEventListener('touchend', end);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('touchmove', move, { passive:false });
    document.addEventListener('mouseup', end);
    document.addEventListener('touchend', end);
  }
  $('crop-box').addEventListener('mousedown', function(e){ if(!e.target.classList.contains('h')) drag(e, null); });
  $('crop-box').addEventListener('touchstart', function(e){ if(!e.target.classList.contains('h')) drag(e, null); }, { passive:false });
  Array.prototype.forEach.call(document.querySelectorAll('#crop-box .h'), function(h){
    var c = h.getAttribute('data-c');
    h.addEventListener('mousedown', function(e){ drag(e, c); });
    h.addEventListener('touchstart', function(e){ drag(e, c); }, { passive:false });
  });
  // Automatikken retter langt de fleste billeder op, men rammer ikke alt.
  // Her kan du altid dreje selv.
  $('crop-rotate').addEventListener('click', function(){
    if(!crop) return;
    crop.rot = (crop.rot + 90) % 360;
    var im = $('crop-img');
    im.style.transform = 'rotate(' + crop.rot + 'deg)';
    im.style.transformOrigin = 'center';
    // Nulstil rammen, så den passer til den nye retning.
    var s2 = $('crop-stage').getBoundingClientRect(), ir = im.getBoundingClientRect();
    crop.frame = { left: ir.left - s2.left, top: ir.top - s2.top, w: ir.width, h: ir.height };
    crop.rect = { x: 0, y: 0, w: ir.width, h: ir.height };
    layoutBox();
  });

  $('crop-cancel').addEventListener('click', function(){
    $('crop').hidden = true;
    $('crop-img').style.transform = '';
    crop = null;
  });
  $('crop-save').addEventListener('click', function(){
    if(!crop || !crop.rect) return;
    var btn = $('crop-save');
    btn.disabled = true; btn.textContent = 'Gemmer …';
    var d = crop.draft, idx = crop.i, img = $('crop-img');
    // Skalér op fra visningsstørrelse til billedets faktiske opløsning.
    var rot = crop.rot || 0;
    var swap = (rot === 90 || rot === 270);
    var natW = swap ? img.naturalHeight : img.naturalWidth;
    var sc = natW / crop.frame.w, r = crop.rect;
    var cw = Math.round(r.w * sc), ch = Math.round(r.h * sc);

    // Tegn hele billedet roteret på et hjælpe-lærred, og beskær derefter — så
    // udsnittet svarer til dét, du ser på skærmen.
    var full = document.createElement('canvas');
    full.width = swap ? img.naturalHeight : img.naturalWidth;
    full.height = swap ? img.naturalWidth : img.naturalHeight;
    var fx = full.getContext('2d');
    fx.translate(full.width/2, full.height/2);
    fx.rotate(rot * Math.PI / 180);
    fx.drawImage(img, -img.naturalWidth/2, -img.naturalHeight/2);

    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    c.getContext('2d').drawImage(full, Math.round(r.x*sc), Math.round(r.y*sc), cw, ch, 0, 0, cw, ch);
    c.toBlob(function(blob){
      if(!blob){ btn.disabled = false; btn.textContent = 'Gem'; return; }
      var path = 'draft-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '-manuel.jpg';
      sb.storage.from('photos').upload(path, blob, { contentType:'image/jpeg' }).then(function(res){
        if(res.error) throw res.error;
        var url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
        var photos = d.photos.slice();
        // Behold originalen. Den manuelle beskaering lagde sin egen fil ind og
        // glemte, hvad den kom af - og saa er der ingen vej tilbage, hverken
        // for dig eller for en ny gennemkoersel af billedbehandlingen. Produkt
        // 8's forfra-billede maatte findes igen paa tidsstemplet i Storage.
        var foer = photos[idx];
        photos[idx] = {
          path: path, url: url, kind: foer.kind, optimized: true,
          org: foer.org || foer.path
        };
        var patch = { photos: photos };
        if(idx === 0){ patch.image_path = path; patch.image_url = url; }
        return sb.from('drafts').update(patch).eq('id', d.id);
      }).then(function(res){
        if(res && res.error) throw res.error;
        $('crop').hidden = true; $('crop-img').style.transform = ''; crop = null;
        toast('Billedet er gemt');
      }).catch(function(){ btn.textContent = 'Prøv igen'; })
        .then(function(){ btn.disabled = false; if(btn.textContent === 'Gemmer …') btn.textContent = 'Gem'; });
    }, 'image/jpeg', 0.92);
  });

  /* ---- Billedernes raekkefoelge -----------------------------------------
     Bestemt af dig 17. oktober: billederne kan flyttes med traek og slip, og
     raekkefoelgen synkroniseres med Vinted begge veje — se fotos.ts i
     vinted-fill-script. Hold fingeren paa et lille billede, til det
     loefter sig, og traek det. Et kort tryk beskaerer stadig.

     Det skal kunne SES (bestemt af dig 17. oktober): billedet svaever over
     fingeren, pladsen det lander paa er en stiplet ramme, naboerne glider
     til side, hver plads har sit nummer, og det foerste hedder »Forside«, og en linje
     under striben siger »Slip her: billede 3 af 12«.

     Beroerings-haendelser, ikke Pointer Events: paa iOS bliver en pointer
     annulleret, saa snart striben begynder at rulle, og et traek kan kun
     holde rullen tilbage med preventDefault paa et touchmove, der ikke er
     passivt. Musen paa en Mac gaar samme vej. */
  function flytbarStribe(strip, d){
    var holdt = null, traek = null;
    var vis = $('d-flyt-vis');
    function celle(t){
      var c = t && t.closest ? t.closest('.strip-cel') : null;
      return c && c.parentNode === strip ? c : null;
    }
    function celler(){ return Array.prototype.slice.call(strip.children); }
    function start(el, x, y){
      el.classList.add('flyt-trykket');
      holdt = { el: el, x: x, y: y, t: setTimeout(function(){ loeft(x, y); }, 280) };
    }
    function glem(){
      if(!holdt) return;
      clearTimeout(holdt.t);
      holdt.el.classList.remove('flyt-trykket');
      holdt = null;
    }
    function loeft(x, y){
      if(!holdt) return;
      var el = holdt.el;
      el.classList.remove('flyt-trykket');
      holdt = null;
      var r = el.getBoundingClientRect();
      // Spoegelset er billedet, der foelger fingeren. Det svaever OVER
      // fingeren, saa du kan se det, du flytter; selve pladsen i striben
      // bliver en stiplet ramme, der viser, hvor det lander.
      var spoegelse = el.querySelector('img').cloneNode(false);
      spoegelse.className = 'flyt-spoegelse';
      spoegelse.removeAttribute('data-i');
      document.body.appendChild(spoegelse);
      traek = {
        el: el, spoegelse: spoegelse, foer: raekke(),
        dx: x - (r.left + r.width / 2), x: x, y: y, top: r.top, rul: 0, ramme: 0,
      };
      el.classList.add('flyt-plads');
      strip.classList.add('flytter');
      placer(x, y);
      fortael();
      ryst(12);
      traek.ramme = requestAnimationFrame(rul);
    }
    function raekke(){
      return celler().map(function(c){ return Number(c.getAttribute('data-i')); });
    }
    function placer(x, y){
      var s = traek.spoegelse;
      // Over fingeren og over striben: under fingeren er billedet skjult.
      s.style.transform = 'translate(' + (x - 40) + 'px,' + (Math.min(y, traek.top + 40) - 120) + 'px) scale(1) rotate(-3deg)';
    }
    function fortael(){
      var n = celler().indexOf(traek.el) + 1;
      celler().forEach(function(c, k){
        var b = c.querySelector('.strip-nr');
        if(b) b.textContent = k === 0 ? 'Forside' : String(k + 1);
      });
      if(vis){
        vis.textContent = n === 1 ? 'Slip her: forsidebilledet' : 'Slip her: billede ' + n + ' af ' + celler().length;
        vis.classList.add('vist');
      }
    }
    // FLIP: maal hvor naboerne stod, flyt pladsen, og lad dem glide fra det
    // gamle sted til det nye. Uden det springer striben, og det er svaert at
    // se, hvad der skete.
    function flytPlads(foran){
      var alle = celler();
      var foer = alle.map(function(c){ return c.getBoundingClientRect().left; });
      strip.insertBefore(traek.el, foran);
      alle.forEach(function(c, k){
        if(c === traek.el) return;
        var dx = foer[k] - c.getBoundingClientRect().left;
        if(!dx || reduce) return;
        c.style.transition = 'none';
        c.style.transform = 'translateX(' + dx + 'px)';
        c.getBoundingClientRect();
        c.style.transition = '';
        c.style.transform = '';
      });
      fortael();
      ryst(4);
    }
    function flyt(x, y){
      traek.x = x; traek.y = y;
      placer(x, y);
      var midt = x - traek.dx;
      var andre = celler().filter(function(c){ return c !== traek.el; });
      var foran = null;
      // Naboens plads uden dens glidning (offsetLeft ser bort fra
      // transform), ellers vipper pladsen frem og tilbage, mens den glider.
      var v0 = strip.getBoundingClientRect().left - strip.scrollLeft;
      for(var k = 0; k < andre.length; k++){
        if(midt < v0 + andre[k].offsetLeft + andre[k].offsetWidth / 2){ foran = andre[k]; break; }
      }
      if(traek.el.nextSibling !== foran || (foran === null && strip.lastChild !== traek.el)){
        if(foran !== traek.el) flytPlads(foran);
      }
    }
    // Ved kanten ruller striben af sig selv — hurtigere jo taettere paa.
    function rul(){
      if(!traek) return;
      var sr = strip.getBoundingClientRect(), zone = 44, v = 0;
      if(traek.x < sr.left + zone) v = -Math.ceil((sr.left + zone - traek.x) / 4);
      else if(traek.x > sr.right - zone) v = Math.ceil((traek.x - (sr.right - zone)) / 4);
      if(v){
        var foer = strip.scrollLeft;
        strip.scrollLeft += v;
        if(strip.scrollLeft !== foer) flyt(traek.x, traek.y);
      }
      traek.ramme = requestAnimationFrame(rul);
    }
    function slut(fortryd){
      glem();
      if(!traek) return;
      var t = traek; traek = null;
      cancelAnimationFrame(t.ramme);
      if(fortryd){
        t.foer.forEach(function(i){ strip.appendChild(strip.querySelector('.strip-cel[data-i="' + i + '"]')); });
      }
      strip.__netFlyttet = true;
      setTimeout(function(){ strip.__netFlyttet = false; }, 400);
      // Spoegelset lander paa pladsen, foer striben tegnes om.
      var r = t.el.getBoundingClientRect();
      var s = t.spoegelse;
      s.classList.add('lander');
      s.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px) scale(' + (r.width / 80) + ') rotate(0deg)';
      var efter = raekke();
      var aendret = efter.join() !== t.foer.join();
      if(aendret) ryst(8);
      setTimeout(function(){
        s.remove();
        t.el.classList.remove('flyt-plads');
        strip.classList.remove('flytter');
        celler().forEach(function(c, k){
          var b = c.querySelector('.strip-nr');
          if(b) b.textContent = k === 0 ? 'Forside' : String(k + 1);
        });
        if(vis){
          vis.textContent = aendret ? 'Gemmer rækkefølgen …' : '';
          vis.classList.toggle('vist', aendret);
        }
        if(!aendret) return;
        t.el.classList.add('flyt-landet');
        var photos = d.photos || [];
        setTimeout(function(){ gemRaekkefoelge(d, efter.map(function(i){ return photos[i]; })); }, reduce ? 0 : 420);
      }, reduce ? 0 : 180);
    }
    function annuller(x, y){
      if(holdt && (Math.abs(x - holdt.x) > 8 || Math.abs(y - holdt.y) > 8)) glem();
    }

    strip.addEventListener('touchstart', function(e){
      var el = celle(e.target);
      if(el && e.touches.length === 1) start(el, e.touches[0].clientX, e.touches[0].clientY);
      else if(e.touches.length > 1) slut(true);
    }, { passive: true });
    strip.addEventListener('touchmove', function(e){
      var p = e.touches[0];
      if(traek){ e.preventDefault(); flyt(p.clientX, p.clientY); } else annuller(p.clientX, p.clientY);
    }, { passive: false });
    strip.addEventListener('touchend', function(){ slut(false); });
    strip.addEventListener('touchcancel', function(){ slut(true); });
    // Et loeftet billede maa ikke aabne iOS' billedmenu.
    strip.addEventListener('contextmenu', function(e){ if(celle(e.target)) e.preventDefault(); });

    strip.addEventListener('mousedown', function(e){
      var el = celle(e.target);
      if(!el || e.button !== 0) return;
      e.preventDefault();
      start(el, e.clientX, e.clientY);
      function bevaeg(ev){
        if(holdt && (Math.abs(ev.clientX - holdt.x) > 6)){ clearTimeout(holdt.t); loeft(ev.clientX, ev.clientY); }
        if(traek) flyt(ev.clientX, ev.clientY);
      }
      function tast(ev){ if(ev.key === 'Escape') op(null, true); }
      function op(ev, fortryd){
        document.removeEventListener('mousemove', bevaeg);
        document.removeEventListener('mouseup', op);
        document.removeEventListener('keydown', tast);
        var flyttet = !!traek;
        slut(!!fortryd);
        if(!flyttet) strip.__netFlyttet = false;
      }
      document.addEventListener('mousemove', bevaeg);
      document.addEventListener('mouseup', op);
      document.addEventListener('keydown', tast);
    });
  }

  // Rod = originalens sti. En beskaering giver en ny fil, men er stadig det
  // samme billede paa Vinted (samme regel som rod() i fotos.ts).
  function fotoRod(p){ return String((p && (p.org || p.path)) || ''); }
  function sammeRaekke(a, b){
    var A = {}, B = {};
    a.forEach(function(r){ A[r] = 1; }); b.forEach(function(r){ B[r] = 1; });
    var x = a.filter(function(r){ return B[r]; }), y = b.filter(function(r){ return A[r]; });
    return x.length === y.length && x.every(function(r, i){ return r === y[i]; });
  }

  // Udkastet faar den nye raekkefoelge straks. Ligger varen ude paa Vinted,
  // laegges raekkefoelgen i annoncens postkasse som enhver anden rettelse:
  // runneren saetter den selv, naeste gang telefonen har en Vinted-side
  // aaben (prisvagtens »gaar selv til«). DBA og Reshopper faar raekkefoelgen,
  // naar varen sendes derhen — en annonce, der allerede er ude dér, kan appen
  // ikke naa.
  function gemRaekkefoelge(d, ny){
    if(!ny.length || ny.some(function(p){ return !p; })) return;
    var foer = d.photos;
    d.photos = ny;
    // Striben tegnes om; rullet ud til hoejre skal den blive staaende dér.
    var rullet = $('d-strip') ? $('d-strip').scrollLeft : 0;
    renderDetail();
    if($('d-strip')) $('d-strip').scrollLeft = rullet;
    sb.from('drafts').update({ photos: ny, image_path: ny[0].path || null, image_url: ny[0].url || null })
      .eq('id', d.id).then(function(res){
        if(res.error) throw res.error;
        var l = vintedAnnonce(d);
        if(!l || !l.external_id || (l.status !== 'aktiv' && l.status !== 'pause')){
          toast('Rækkefølgen er gemt');
          return;
        }
        // Har Vinted lagt billederne op paa ny, kan de ikke parres (fotos.ts).
        if(l.fotos && l.fotos.udskiftet){
          toast('Gemt i appen. Vinted har lagt billederne op på ny, så rækkefølgen kan ikke sendes dertil');
          return;
        }
        var raekke = ny.map(fotoRod);
        var ude = l.published && l.published.fotos;
        if(ude && sammeRaekke(ude, raekke)){
          // Tilbage til det, der staar paa Vinted: intet at sende.
          if(l.pending && l.pending.fotos){
            var rest = Object.assign({}, l.pending); delete rest.fotos;
            var tom = !Object.keys(rest).length;
            return sb.from('listings').update(tom ? { pending: null, pending_note: null, pending_since: null } : { pending: rest })
              .eq('id', l.id).then(function(){ toast('Rækkefølgen er som på Vinted igen'); hentAnnoncer(d.id); });
          }
          toast('Rækkefølgen er gemt');
          return;
        }
        return koeTilMarkedsplads(d, { fotos: raekke }).then(function(){
          toast('Gemt — Vinted får rækkefølgen næste gang en Vinted-side er åben i Safari');
          hentAnnoncer(d.id);
        });
      }).catch(function(err){
        d.photos = foer;
        renderDetail();
        toast('Kunne ikke gemme rækkefølgen: ' + (err && err.message ? err.message : 'ukendt fejl'));
      });
  }

  /* ---- Menu og historik ------------------------------------------------- */
  $('m-opsaet').addEventListener('click', function(){ show('opsaet'); tegnTjek(); });

  // Temaet: som enheden, lyst eller moerkt. Gemmes kun paa denne telefon.
  function tegnTema(){
    var t = 'enhed';
    try{ t = localStorage.getItem('udbakke-tema') || 'enhed'; }catch(e){}
    Array.prototype.forEach.call(document.querySelectorAll('#tema [data-tema]'), function(b){
      var on = b.getAttribute('data-tema') === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#tema [data-tema]'), function(b){
    b.addEventListener('click', function(){
      var t = b.getAttribute('data-tema');
      try{ localStorage.setItem('udbakke-tema', t); }catch(e){}
      if(window.saetTema) window.saetTema(t);
      tegnTema();
    });
  });
  tegnTema();
  $('tjek').addEventListener('click', function(){ show('opsaet'); tegnTjek(); });

  /* ---- Virker opsaetningen? ----------------------------------------------
     Hver del svarer med et tidspunkt. 2. oktober laa nr. 19-21 ude med en
     runner to udgivelser bagud, uden at det kunne ses nogen steder. */
  function friskhed(iso, dage){
    return iso && (Date.now() - new Date(iso).getTime()) < dage * 86400000;
  }
  function tegnTjek(){
    var el = $('tjek');
    var notif = !pushMuligt() ? [null, 'kun i appen på hjemmeskærmen']
      : Notification.permission === 'granted' ? [true, 'slået til']
      : Notification.permission === 'denied' ? [false, 'blokeret i telefonens indstillinger']
      : [false, 'ikke slået til'];
    function tegn(puls, mail){
      var p = {};
      (puls || []).forEach(function(x){ p[x.navn] = x; });
      function auto(k){
        var x = p[k];
        if(!x) return [null, 'ikke set siden opdateringen'];
        // Serveren skriver »forældet«, når brugerscriptet ikke er den nyeste
        // udgave. Siden selv viser et bånd med en Opdatér-knap.
        if(/forældet/.test(x.detalje || '')) return [false, x.detalje.replace(/^.* · /, '') + ' — tryk Opdatér på Vinted/DBA, eller installér igen herunder'];
        return [friskhed(x.sidst, 14),'hentet ' + relTime(x.sidst) + (x.detalje ? ' · ' + x.detalje : '')];
      }
      var v = auto('vinted-runner'), db = auto('dba-runner');
      // Det daglige tjek er valgfrit: uden det er det ikke »galt«, bare ikke sat op.
      var dg = p['prisvagt-dagligt'];
      var dagligt = dg ? [friskhed(dg.sidst, 2) ? true : false, 'kørte ' + relTime(dg.sidst) + (dg.detalje ? ' · ' + dg.detalje : '')]
                       : [null, 'ikke sat op'];
      var m = mail ? [friskhed(mail.at, 30), 'sidste mail ' + relTime(mail.at)]
                   : [false, 'ingen mails modtaget — ikke sat op'];
      var res = { notif: notif, vinted: v, dagligt: dagligt, dba: db, mail: m };
      var NAVN = { notif: 'Notifikationer', vinted: 'Vinted', dagligt: 'dagligt pristjek', dba: 'DBA', mail: 'mails' };
      var gale = Object.keys(res).filter(function(k){ return res[k][0] === false; });
      var ok = Object.keys(res).filter(function(k){ return res[k][0] === true; }).length;
      Object.keys(res).forEach(function(k){
        var t = document.querySelector('.trin[data-tjek="' + k + '"]');
        if(!t) return;
        t.querySelector('.tjek-prik').className = 'tjek-prik ' +
          (!puls ? '' : res[k][0] === true ? 'ok' : res[k][0] === false ? 'nej' : 'maaske');
        t.querySelector('.trin-status').textContent = puls ? res[k][1] : 'tjekker …';
        t.classList.toggle('galt', !!puls && res[k][0] === false);
      });
      if(!puls){
        el.className = 'tjek-kort';
        el.innerHTML = '<span class="tjek-prik" aria-hidden="true"></span><span class="tjek-k">Tjekker opsætningen …</span>';
        return;
      }
      el.className = 'tjek-kort ' + (gale.length ? 'nej' : 'ok');
      el.innerHTML = '<span class="tjek-prik ' + (gale.length ? 'nej' : 'ok') + '" aria-hidden="true"></span>' +
        '<span class="tjek-k">' + (gale.length
          ? (gale.length === 1 ? '1 ting skal ses på' : gale.length + ' ting skal ses på') +
            '<small>' + esc(gale.map(function(k){ return NAVN[k]; }).join(', ')) + '</small>'
          : 'Alt virker<small>Notifikationer, automatik og mails</small>') + '</span>' +
        '<span class="chev"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span>';
      $('opsaet-tal').textContent = ok + ' af ' + Object.keys(res).length + ' virker';
      var mt = $('mere-tal');
      if(mt){ mt.textContent = String(gale.length); mt.hidden = !gale.length; }
    }
    tegn(null, null);
    Promise.all([
      sb.from('puls').select('navn, sidst, detalje'),
      sb.from('vinted_mails').select('at').order('at', { ascending: false }).limit(1)
    ]).then(function(r){
      tegn(r[0].data || [], (r[1].data || [])[0] || null);
    }).catch(function(){});
  }
  // Adressen, Genvejes automation aabner hver dag. #-flaget overlever Vinteds
  // omdirigeringer (maalt 8. oktober), og runneren tager saa alt forfaldent.
  var DAGLIGT_URL = 'https://www.vinted.dk/#udbakke=vagt';
  $('m-dagligt-kopier').addEventListener('click', function(){
    if(navigator.clipboard) navigator.clipboard.writeText(DAGLIGT_URL).then(function(){ toast('Adressen er kopieret'); },
      function(){ toast(DAGLIGT_URL); });
    else toast(DAGLIGT_URL);
  });
  $('m-dagligt-proev').addEventListener('click', function(){ aabnUdad(DAGLIGT_URL); });
  $('m-logout').addEventListener('click', function(){
    sb.auth.signOut().then(function(){ stack = []; show('login', { fade:true }); });
  });
  // Userscripts genkender en .user.js-adresse og tilbyder at gemme den. Derfra
  // henter den selv nye udgaver, så automatikken kan rettes uden at du gør noget.
  // x-safari- tvinger rigtig Safari. Uden det aabner adressen inde i PWAens
  // egen webvisning, og dér findes Userscripts-udvidelsen ikke: man ser koden,
  // men der er ingen ᴀA-menu og intet at installere med. Knappen ser ud til
  // ikke at virke, selv om den gjorde praecis det, den fik besked paa.
  function installer(url){ aabnUdad(url); }
  $('m-userscript').addEventListener('click', function(){
    // Stien SKAL ende paa .user.js - ellers tilbyder Userscripts ikke at
    // installere den. Et forespoergselsparameter er ikke nok.
    installer(FILL_API.replace('?key=', '/udbakke.user.js?key='));
  });
  $('m-userscript-dba').addEventListener('click', function(){
    installer(DBA_API.replace('?key=', '/dba.user.js?key='));
  });
  // Lukker fanen, naar automatikken er faerdig og intet venter paa dig. Et
  // eget script, for GM.closeTab findes kun i udvidelsens rum.
  $('m-userscript-luk').addEventListener('click', function(){
    installer(FILL_API.replace('?key=', '/udbakke-luk.user.js?key='));
  });

  // ---- Notifikationer -----------------------------------------------------
  function notifTilstand(){
    var b = $('m-notif'), note = $('notif-note');
    if(!b) return;
    if(!pushMuligt()){
      b.disabled = true; b.textContent = 'Ikke muligt her';
      note.textContent = 'Notifikationer kraever, at appen er lagt paa hjemmeskaermen (Del → Foej til hjemmeskaerm) og aabnet derfra. I et browser-faneblad kan iOS ikke sende dem.';
      return;
    }
    if(Notification.permission === 'granted'){
      b.disabled = false; b.classList.remove('btn-secondary'); b.classList.add('btn-quiet');
      b.textContent = 'Notifikationer er slaaet til';
    } else if(Notification.permission === 'denied'){
      b.disabled = true; b.textContent = 'Blokeret i Indstillinger';
      note.textContent = 'Du har afvist notifikationer. Slaa dem til igen under Indstillinger → VintedAuto → Notifikationer paa telefonen.';
    } else {
      b.disabled = false; b.textContent = 'Slaa notifikationer til';
    }
  }

  function slaaNotifTil(){
    var b = $('m-notif');
    b.disabled = true; b.textContent = 'Beder om lov …';
    Notification.requestPermission().then(function(p){
      if(p !== 'granted'){ notifTilstand(); return; }
      return navigator.serviceWorker.ready.then(function(reg){
        return reg.pushManager.getSubscription().then(function(eks){
          return eks || reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidBytes(VAPID_PUBLIC)
          });
        });
      }).then(function(sub){
        return fetch(PUSH_SUB_API, {
          method: 'POST', headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() })
        });
      }).then(function(){ toast('Notifikationer er slaaet til'); });
    }).catch(function(e){ toast('Kunne ikke slaa til: ' + e.message); })
      .then(function(){ notifTilstand(); });
  }
  if($('m-notif')) $('m-notif').addEventListener('click', slaaNotifTil);

  // Opsaetningen er skrevet til telefonen, for det er dér den hoerer hjemme.
  // Paa en Mac er den samme udvidelse og det samme bogmaerke - men menuerne
  // ligger andre steder, og en vejledning, der peger paa knapper der ikke
  // findes, er vaerre end ingen.
  if(!PAA_IOS){
    $('ol-udvidelse').innerHTML =
      '<li>Hent <b>Userscripts</b> i App Store — den findes også til Mac</li>' +
      '<li><b>Safari → Indstillinger → Udvidelser</b>: slå <b>Userscripts</b> til</li>' +
      '<li>Tryk på udvidelsens ikon i værktøjslinjen → <b>Altid tillad på alle websteder</b></li>' +
      '<li>Tryk <b>Installér automatikken</b> herunder — koden åbner i et nyt faneblad</li>' +
      '<li>Tryk på <b>Userscripts</b>-ikonet → <b>Install</b></li>';
    $('note-udvidelse').textContent =
      'Det sidste trin er let at overse: installationen sker i udvidelsens lille ' +
      'vindue i værktøjslinjen, ikke på selve siden. Ser du kun kode og ingen knap, ' +
      'har udvidelsen ikke fået lov på det websted endnu.';
    $('ol-bogmaerke').innerHTML =
      '<li>Tryk <b>Kopiér bogmærke-kode</b></li>' +
      '<li><b>Bogmærker → Tilføj bogmærke</b> — gem i <b>Favoritter</b> som <b>Udfyld Vinted</b></li>' +
      '<li><b>Bogmærker → Redigér bogmærker</b> → højreklik på det → <b>Redigér adresse</b> → ' +
      'slet adressen, <b>indsæt</b> koden</li>';
  }

  $('m-copy').addEventListener('click', function(){
    navigator.clipboard.writeText(BOOKMARKLET).then(function(){
      toast('Koden er kopieret — indsæt den som bogmærkets adresse');
    }).catch(function(){ toast('Kunne ikke kopiere'); });
  });
  /* ---- Redigering, og vejen ud til markedspladsen -------------------------
     Synkroniseringen gaar begge veje. Den ene vej er at LAESE annoncen; den
     her er at skrive. Men serveren kan ikke skrive i Vinteds formular — det
     kan kun din egen session. Saa en rettelse her bliver til en besked, der
     ligger og venter paa annoncen, indtil den er skrevet ind.

     Kun titel, pris og beskrivelse: det er dem, Vinteds redigeringsformular
     har som almindelige tekstfelter. Kategori, maerke og stoerrelse er
     vaelgere, og de hoerer til, naar annoncen oprettes. */

  var REDIGERES = null;
  var VAELGERE = ['brand', 'size', 'color', 'condition', 'material'];

  // Vinteds egne vaerdier — samme ordlyd som VINTED_COLORS/VINTED_CONDITIONS
  // i vinted-fill-script. DBA og Reshopper oversaetter selv fra dem. Ret
  // listerne begge steder.
  var FARVER = [
    ['Sort','#1d1d1d'], ['Grå','#8d9195'], ['Hvid','#ffffff'], ['Flødefarvet','#f3ead3'],
    ['Beige','#d9c4a0'], ['Abrikos','#f4b88a'], ['Orange','#ec7a2c'], ['Koral','#f2766b'],
    ['Rød','#c8282d'], ['Bourgogne','#6e1a2b'], ['Lyserød','#f6b6c8'], ['Rosa','#e98aa6'],
    ['Lilla','#7b3f9a'], ['Lyslilla','#c6a8dd'], ['Lyseblå','#9fc8ec'], ['Blå','#2c62c4'],
    ['Marineblå','#1f2c4f'], ['Turkis','#2bb3b1'], ['Mintgrøn','#a8e0c4'], ['Grøn','#3c9a4a'],
    ['Mørkegrøn','#24452f'], ['Khaki','#837c4f'], ['Brun','#6e4a2e'], ['Sennepsgul','#d1a32a'],
    ['Gul','#f5d63d'], ['Sølv','linear-gradient(135deg,#eef0f2,#a5abb2)'],
    ['Guld','linear-gradient(135deg,#f7e08a,#b88a2a)'],
    ['Flerfarvet','conic-gradient(#e53935,#fbc02d,#43a047,#1e88e5,#8e24aa,#e53935)'],
    ['Klar','repeating-linear-gradient(45deg,#fff 0 4px,#dfe5e8 4px 8px)']
  ];
  var STANDE = [
    ['Ny med prismærker', 'Ubrugt, prismærket sidder på'],
    ['Ny uden prismærker', 'Ubrugt, uden prismærke'],
    ['Meget god', 'Brugt lidt, ingen fejl'],
    ['God', 'Brugt, få tegn på brug'],
    ['Tilfredsstillende', 'Tydeligt brugt, med fejl']
  ];
  var MATERIALER = ['Bomuld', 'Polyester', 'Uld', 'Merinould', 'Kashmir', 'Hør', 'Silke', 'Viskose',
    'Lyocell', 'Modal', 'Nylon', 'Elastan', 'Akryl', 'Denim', 'Fleece', 'Strik', 'Dun', 'Læder',
    'Ruskind', 'Kunstlæder', 'Fløjl', 'Satin', 'Gore-Tex', 'Softshell', 'Gummi', 'Træ', 'Metal', 'Plastik'];
  var STOERRELSER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Én størrelse',
    '34', '36', '38', '40', '42', '44', '46', '48',
    '56 cm', '62 cm', '68 cm', '74 cm', '80 cm', '86 cm', '92 cm', '98 cm', '104 cm', '110 cm',
    '116 cm', '122 cm', '128 cm', '134 cm', '140 cm', '146 cm', '152 cm', '158 cm', '164 cm', '170 cm'];

  // Kategorien staar som Vinteds sti; i feltet skrives den »Kvinder › Tøj«.
  function stiTekst(sti){ return Array.isArray(sti) ? sti.join(' › ') : ''; }
  function stiAf(t){
    return String(t || '').split(/\s*[›>\/]\s*/).map(function(x){ return x.trim(); }).filter(Boolean);
  }

  // Forslagene i felterne: Vinteds lister og det, dine andre varer har.
  function fyldForslag(id, vaerdier){
    var set = {}, ud = [];
    vaerdier.forEach(function(v){
      v = String(v || '').trim();
      if(v && !set[v.toLowerCase()]){ set[v.toLowerCase()] = 1; ud.push(v); }
    });
    $(id).innerHTML = ud.map(function(v){ return '<option value="' + esc(v) + '">'; }).join('');
  }
  function forslag(){
    var alle = Object.keys(rows).map(function(k){ return rows[k]; });
    fyldForslag('dl-kategori', alle.map(function(r){ return stiTekst(r.category_path); }).sort());
    fyldForslag('dl-brand', alle.map(function(r){ return r.brand; }).sort(function(a, b){
      return String(a || '').localeCompare(String(b || ''), 'da'); }));
    fyldForslag('dl-size', STOERRELSER.concat(alle.map(function(r){ return r.size; })));
    fyldForslag('dl-material', MATERIALER.concat(alle.map(function(r){ return r.material; })));
  }

  // Farve og stand er Vinteds faste valg, saa de vaelges med et tryk i stedet
  // for at blive tastet. En farve uden for listen (fra foer reglen) vises som
  // sin egen knap, saa den ikke forsvinder i stilhed.
  function tegnFarver(){
    var v = $('e-color').value;
    var liste = FARVER.slice();
    if(v && !FARVER.some(function(f){ return f[0] === v; })) liste.push([v, 'var(--surface)']);
    $('e-farver').innerHTML = liste.map(function(f){
      var on = f[0] === v;
      return '<button type="button" role="radio" class="ef-farve' + (on ? ' on' : '') + '" aria-checked="' + on +
        '" data-farve="' + esc(f[0]) + '" title="' + esc(f[0]) + '"><i style="background:' + f[1] + '"></i>' +
        '<span>' + esc(f[0]) + '</span></button>';
    }).join('');
    $('e-color-vist').textContent = v ? '· ' + v : '· ikke valgt';
  }
  function tegnStande(){
    var v = $('e-condition').value;
    var liste = STANDE.slice();
    if(v && !STANDE.some(function(x){ return x[0] === v; })) liste.push([v, '']);
    $('e-stande').innerHTML = liste.map(function(x){
      var on = x[0] === v;
      return '<button type="button" role="radio" class="ef-stand' + (on ? ' on' : '') + '" aria-checked="' + on +
        '" data-stand="' + esc(x[0]) + '"><b>' + esc(x[0]) + '</b>' + (x[1] ? '<small>' + esc(x[1]) + '</small>' : '') + '</button>';
    }).join('');
  }
  function tegnKoen(v){
    Array.prototype.forEach.call(document.querySelectorAll('#e-koen [data-koen]'), function(b){
      var on = b.getAttribute('data-koen') === (v || '');
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  function valgtKoen(){
    var b = document.querySelector('#e-koen .on');
    return b ? b.getAttribute('data-koen') : '';
  }
  $('e-farver').addEventListener('click', function(e){
    var b = e.target.closest('[data-farve]');
    if(!b) return;
    var f = b.getAttribute('data-farve');
    // Et tryk paa den valgte farve fjerner den igen.
    $('e-color').value = $('e-color').value === f ? '' : f;
    tegnFarver();
  });
  $('e-stande').addEventListener('click', function(e){
    var b = e.target.closest('[data-stand]');
    if(!b) return;
    $('e-condition').value = b.getAttribute('data-stand');
    tegnStande();
  });
  $('e-koen').addEventListener('click', function(e){
    var b = e.target.closest('[data-koen]');
    if(b) tegnKoen(b.getAttribute('data-koen'));
  });

  // Vinteds stoerrelsesvaelger har faner (S/M/L, EU …). Retter du
  // stoerrelsen, skal fanen passe til den nye — ellers leder runneren i den
  // forkerte. Boernestoerrelser i cm regnes om af serveren selv.
  function stoerrelsesSkala(size, gammel){
    var t = String(size || '').trim();
    if(/^(\d?X{0,3}[SL]|M|X{1,3}L|\dXL)$/i.test(t)) return 'S/M/L';
    if(/^\d{2}([.,]5)?$/.test(t)) return 'EU';
    return gammel || null;
  }
  // Den Vinted-annonce, rettelsen skal ud i — og det, der står i den lige nu.
  var REDIGERES_ANNONCE = null;
  // Teksten, du startede fra paa redigeringsskaermen — eller den, modellen
  // senest skrev forfra. Kun forskellen mellem den og det, du har skrevet, er
  // DIN rettelse og bliver til laering.
  var REDIGERES_GRUNDLAG = null;

  // Et mål i hele cm, eller null. Under 10 eller over 250 cm er en tastefejl.
  function cmTal(v){
    var n = Math.round(Number(String(v || '').replace(',', '.').replace(/[^0-9.]/g, '')));
    return n >= 10 && n <= 250 ? n : null;
  }

  // Hele kroner ud af en pristekst — NaN, naar der ingen pris er. At slette
  // alt andet end cifre gjorde "89,50 kr" til 8950. Staar komma og punktum
  // begge, er det sidste decimaltegnet; staar kun det ene foran praecis tre
  // cifre, er det tusinder ("1.200"), ellers decimaler ("12,50"). Samme regel
  // som _shared/pris.ts paa serveren.
  function prisTal(v){
    if(typeof v === 'number') return isFinite(v) && v > 0 ? Math.round(v) : NaN;
    var m = String(v == null ? '' : v).replace(/(\d)[\s\u00a0](?=\d{3}(?!\d))/g, '$1').match(/\d[\d.,]*/);
    if(!m) return NaN;
    var t = m[0].replace(/[.,]+$/, '');
    var i = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
    if(i >= 0){
      var begge = t.indexOf('.') > -1 && t.indexOf(',') > -1;
      var flere = t.split(t[i]).length > 2;
      t = (begge || (!flere && t.length - i - 1 !== 3))
        ? t.slice(0, i).replace(/[.,]/g, '') + '.' + t.slice(i + 1)
        : t.replace(/[.,]/g, '');
    }
    var n = Math.round(Number(t));
    return isFinite(n) && n > 0 ? n : NaN;
  }

  // Hvad står der LIGE NU, felt for felt? Annoncens egne ord, hvor de er
  // læst; udkastet ellers. Er titlen rettet på Vinted, er det den, du retter
  // videre i — ikke den, appen sendte afsted for tre uger siden.
  function nuvaerende(d, l){
    var p = (l && l.published) || {};
    return {
      title: p.title || d.title || '',
      description: p.description || d.description || '',
      price: prisTal(p.price) || prisTal(d.price)
    };
  }

  function aabnRedigering(d){
    REDIGERES = d;
    REDIGERES_ANNONCE = null;
    $('e-title').value = d.title || '';
    $('e-desc').value = d.description || '';
    $('e-price').value = String(prisTal(d.price) || '');
    REDIGERES_GRUNDLAG = { title: d.title || '', description: d.description || '' };
    VAELGERE.forEach(function(k){ $('e-' + k).value = d[k] || ''; });
    $('e-kategori').value = stiTekst(d.category_path);
    $('e-laengde').value = (d.fakta || {}).laengde || '';
    $('e-skulder').value = (d.fakta || {}).skulderbredde || '';
    tegnFarver(); tegnStande(); tegnKoen((d.fakta || {}).koen || '');
    forslag();
    // Felterne kan altid rettes: de bruges hver gang varen sendes til en
    // markedsplads. En annonce, der allerede er ude paa Vinted, faar dem dog
    // ikke — Vinteds vaelgere kan kun saettes i Vinteds egen formular.
    $('e-vaelgere-note').textContent = fase(d) === 'klar'
      ? 'Bruges af Vinted, DBA og Reshopper, når varen sendes derhen.'
      : 'Bruges, når varen sendes til en ny markedsplads.';
    $('e-save').textContent = 'Gem';
    $('edit-note').innerHTML = '';
    show('edit');
    // Hvor rettelsen ender, skal staa FOER du retter — ikke som en
    // overraskelse bagefter.
    sb.from('listings').select('platform, status, external_id, published, pending').eq('draft_id', d.id)
      .in('status', ['aktiv','pause']).then(function(res){
        if(REDIGERES !== d || !$('edit-note')) return;
        var l = res.data || [];
        var vinted = l.filter(function(x){ return x.platform === 'vinted' && x.external_id; })[0];
        REDIGERES_ANNONCE = vinted || null;
        if(vinted){
          // Felterne skiftes kun, hvis du ikke allerede er gået i gang med dem.
          var nu = nuvaerende(d, vinted);
          if($('e-title').value === (d.title || '')) $('e-title').value = nu.title;
          if($('e-desc').value === (d.description || '')) $('e-desc').value = nu.description;
          if(ensLyd(REDIGERES_GRUNDLAG.title, d.title) && ensLyd(REDIGERES_GRUNDLAG.description, d.description))
            REDIGERES_GRUNDLAG = { title: $('e-title').value, description: $('e-desc').value };
          if($('e-price').value === String(prisTal(d.price) || '') && nu.price)
            $('e-price').value = String(nu.price);
          $('e-save').textContent = 'Gem og send til Vinted';
        }
        if(vinted) $('e-vaelgere-note').innerHTML = 'Bruges, når varen sendes til DBA eller Reshopper. ' +
          'Annoncen på Vinted har sine egne — dem retter du på <a href="x-safari-https://www.vinted.dk/items/' +
          esc(vinted.external_id) + '/edit">Vinted</a>.';
        var p = l.map(function(x){ return markedsNavn(x.platform); });
        // Det, der i forvejen ligger i postkassen, gaar med ud ved samme tryk.
        // Det skal du vide, foer du trykker — ikke opdage paa Vinted.
        var venter = vinted ? venterFelter(vinted) : [];
        $('edit-note').innerHTML = '<p class="note">' + (vinted
          ? 'Felterne viser, hvad der står i annoncen på <b>Vinted</b> nu. Gemmer du, ' +
            'åbner annoncen, og ændringen skrives ind og gemmes af sig selv.' +
            (venter.length ? ' Der venter allerede: <b>' + esc(venter.join(', ')) +
              '</b> — det går med ud.' : '')
          : p.length
          ? 'Varen ligger på <b>' + esc(p.join(', ')) + '</b>. Det du retter her, bliver ' +
            'lagt klar til annoncen — du sender det afsted med ét tryk bagefter.'
          : 'Varen ligger ikke på nogen markedsplads endnu, så rettelsen bliver kun ' +
            'i udkastet.') + '</p>';
      });
  }

  // De felter, du har rettet i forhold til udkastet — maerke, stoerrelse,
  // farve, stand, materiale og maal — som { felt: { fra, til } }. De er ikke
  // gemt endnu, men beskrivelsen skal kunne skrives forfra ud fra dem.
  function feltRettelser(d){
    var ud = {};
    VAELGERE.forEach(function(k){
      var v = $('e-' + k).value.trim();
      if(!ensLyd(v, d[k])) ud[k] = { fra: d[k] || '', til: v };
    });
    var fk = d.fakta || {};
    var kat = stiTekst(stiAf($('e-kategori').value));
    if(kat !== stiTekst(d.category_path)) ud.kategori = { fra: stiTekst(d.category_path), til: kat };
    if(valgtKoen() !== (fk.koen || '')) ud.koen = { fra: fk.koen || '', til: valgtKoen() };
    var lg = cmTal($('e-laengde').value), sk = cmTal($('e-skulder').value);
    if(lg !== (fk.laengde || null)) ud.laengde = { fra: fk.laengde || '', til: lg || '' };
    if(sk !== (fk.skulderbredde || null)) ud.skulderbredde = { fra: fk.skulderbredde || '', til: sk || '' };
    return ud;
  }

  // Din rettelse af titel og tekst, sendt til serveren (mode:'omskriv'), som
  // noterer det fjernede og det tilfoejede i rettelser. Med skriv:true kommer
  // en ny, komplet beskrivelse tilbage, skrevet ud fra felterne, som de staar.
  function sendTekstRettelse(d, skriv){
    return fetch(FILL_API, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode:'omskriv', id: d.id, skriv: !!skriv,
        fra: REDIGERES_GRUNDLAG,
        title: $('e-title').value.trim(), description: $('e-desc').value.trim(),
        felter: skriv ? feltRettelser(d) : undefined,
        titelRettet: !ensLyd($('e-title').value, REDIGERES_GRUNDLAG.title) })
    }).then(function(r){ return r.json(); });
  }

  $('e-omskriv').addEventListener('click', function(){
    var d = REDIGERES, knap = $('e-omskriv');
    if(!d || !REDIGERES_GRUNDLAG) return;
    if(ensLyd($('e-title').value, REDIGERES_GRUNDLAG.title) && ensLyd($('e-desc').value, REDIGERES_GRUNDLAG.description) &&
      !Object.keys(feltRettelser(d)).length){
      toast('Ret først i et felt — titel, tekst, mærke, farve …'); return;
    }
    var tekst = knap.textContent;
    knap.disabled = true; knap.textContent = 'Skriver …';
    sendTekstRettelse(d, true).then(function(svar){
      knap.disabled = false; knap.textContent = tekst;
      if(REDIGERES !== d) return;
      if(!svar || !svar.description){ toast('Kunne ikke skrive forfra' + (svar && svar.error ? ': ' + svar.error : '')); return; }
      $('e-desc').value = svar.description;
      // En ny titel kommer kun, naar du har rettet et felt, der kan staa i
      // den, og ikke selv har rettet titlen.
      if(svar.title) $('e-title').value = svar.title;
      // Det, modellen skrev, er ikke din rettelse. Retter du videre, er det
      // forskellen fra DENNE tekst, der laeres af.
      REDIGERES_GRUNDLAG = { title: $('e-title').value.trim(), description: svar.description };
      d._tekstRettet = true;
      var n = (svar.fjernet || []).length, m = (svar.tilfoejet || []).length;
      toast((svar.title ? 'Titel og tekst skrevet forfra — ' : 'Skrevet forfra — ') + (n || m ? 'husker ' + n + ' fjernet og ' + m + ' tilføjet' : 'tjek den, og tryk Gem'));
    }).catch(function(){
      knap.disabled = false; knap.textContent = tekst;
      toast('Kunne ikke skrive forfra — prøv igen');
    });
  });

  $('edit-form').addEventListener('submit', function(e){
    e.preventDefault();
    var d = REDIGERES;
    if(!d) return;
    var knap = $('e-save');
    var nyTitel = $('e-title').value.trim();
    var nyTekst = $('e-desc').value.trim();
    var nyPrisTal = prisTal($('e-price').value);
    if(!nyTitel){ toast('Titlen må ikke være tom'); return; }

    // Kun det, der FAKTISK er lavet om, sendes videre. Ellers ville et besoeg
    // paa skaermen uden aendringer alligevel sende en runde til Vinted og
    // skrive de samme ord ind igen. "Lavet om" maales mod det, der staar i
    // annoncen nu — en titel, du har rettet paa Vinted, skal ikke skrives
    // tilbage til den gamle, fordi du bagefter rettede prisen i appen.
    var annonce = REDIGERES_ANNONCE;
    var nu = nuvaerende(d, annonce);
    var aendret = {};
    if(!ensLyd(nyTitel, nu.title)) aendret.title = nyTitel;
    if(!ensLyd(nyTekst, nu.description)) aendret.description = nyTekst;
    if(isFinite(nyPrisTal) && nyPrisTal > 0 && nyPrisTal !== nu.price) aendret.price = nyPrisTal;
    var vaelg = {};
    VAELGERE.forEach(function(k){
      var v = $('e-' + k).value.trim();
      if(!ensLyd(v, d[k])) vaelg[k] = v || null;
    });
    if('size' in vaelg) vaelg.size_scale = stoerrelsesSkala(vaelg.size, d.size_scale);
    var sti = stiAf($('e-kategori').value);
    if(stiTekst(sti) !== stiTekst(d.category_path)){
      vaelg.category_path = sti.length ? sti : null;
      // Varetypen paa kortet er kategoriens sidste led.
      if(sti.length) vaelg.category = sti[sti.length - 1];
    }
    // Plaggets mål, du selv har målt, er de sikreste. De ligger i fakta,
    // og Vinted-runneren skriver dem i »Længde« og »Skulderbredde«. Koennet
    // (DBA og Reshopper) ligger ogsaa i fakta.
    var fk = d.fakta || {};
    var lg = cmTal($('e-laengde').value), sk = cmTal($('e-skulder').value);
    var koen = valgtKoen();
    if(lg !== (fk.laengde || null) || sk !== (fk.skulderbredde || null) || koen !== (fk.koen || '')){
      var nyF = Object.assign({}, fk);
      if(lg) nyF.laengde = lg; else delete nyF.laengde;
      if(sk) nyF.skulderbredde = sk; else delete nyF.skulderbredde;
      if(lg !== (fk.laengde || null) || sk !== (fk.skulderbredde || null)){
        if(lg || sk) nyF.plagMaalKilde = 'målt af dig'; else delete nyF.plagMaalKilde;
      }
      if(koen) nyF.koen = koen; else delete nyF.koen;
      vaelg.fakta = nyF;
    }
    // Reshoppers oversaettelse er gemt; er et felt rettet, laves den forfra.
    if(Object.keys(vaelg).length && d.reshopper) vaelg.reshopper = null;
    var udkastAendret = !ensLyd(nyTitel, d.title) || !ensLyd(nyTekst, d.description) ||
      (isFinite(nyPrisTal) && nyPrisTal > 0 && nyPrisTal !== prisTal(d.price)) ||
      Object.keys(vaelg).length > 0;
    if(!Object.keys(aendret).length && !udkastAendret){
      back(); toast('Der var ikke noget at ændre'); return;
    }

    var tekst = knap.textContent;
    knap.disabled = true; knap.textContent = 'Gemmer …';
    var opd = { title: nyTitel, description: nyTekst };
    // Har du rettet teksten selv, laeres der af det, og Vinteds markedsrunde
    // lader den staa ved udfyldningen (tekst_rettet).
    var tekstRettet = !ensLyd(nyTitel, d.title) || !ensLyd(nyTekst, d.description);
    if(REDIGERES_GRUNDLAG && (!ensLyd(nyTitel, REDIGERES_GRUNDLAG.title) || !ensLyd(nyTekst, REDIGERES_GRUNDLAG.description))){
      sendTekstRettelse(d, false).catch(function(){});
    }
    if(tekstRettet || d._tekstRettet) opd.tekst_rettet = new Date().toISOString();
    if(isFinite(nyPrisTal) && nyPrisTal > 0) opd.price = String(nyPrisTal);
    Object.keys(vaelg).forEach(function(k){ opd[k] = vaelg[k]; });

    var gemt = sb.from('drafts').update(opd).eq('id', d.id).then(function(res){
      if(res.error) throw new Error(res.error.message);
      d.title = opd.title; d.description = opd.description;
      if(opd.price) d.price = opd.price;
      Object.keys(vaelg).forEach(function(k){ d[k] = vaelg[k]; });
      rows[d.id] = d;
      return Object.keys(aendret).length ? koeTilMarkedsplads(d, aendret) : 0;
    });

    // Rettelsen gaar ud med det samme. Trykket paa Gem er dit tryk; der skal
    // ikke ogsaa et "Send til Vinted" bagefter. Annoncens redigeringsside
    // aabnes, runneren skriver felterne ind og gemmer, og kvitteringen kommer,
    // naar aendringen er laest TILBAGE fra annoncen. Vinduet skal aabnes nu,
    // mens trykket staar paa — gik gemningen galt, lukkes det igen.
    var sendUd = !!(annonce && Object.keys(aendret).length);
    if(sendUd){
      aabnUdad('https://www.vinted.dk/items/' + annonce.external_id + '/edit#udbakke=send',
        gemt.then(function(){ return true; }, function(){ return false; }));
    }

    gemt.then(function(antal){
      knap.disabled = false; knap.textContent = tekst;
      renderQueue();
      back();
      toast(sendUd ? 'Gemt — Vinted åbner og skriver ændringen ind'
          : antal ? 'Gemt — og lagt klar til markedspladsen' : 'Gemt');
      if(currentId === d.id){ renderDetail(); hentAnnoncer(d.id); }
      opdaterVagtTal();
    }).catch(function(err){
      knap.disabled = false; knap.textContent = tekst;
      toast('Kunne ikke gemme: ' + (err && err.message ? err.message : 'ukendt fejl'));
    });
  });

  // Rettelsen lægges i annoncens postkasse. Ligger der allerede noget — fx en
  // prisnedsættelse fra prisvagten — lægges den ovenpå, saa de to ikke
  // overskriver hinanden paa vej ud.
  function koeTilMarkedsplads(d, aendret){
    return sb.from('listings').select('id, pending, price')
      .eq('draft_id', d.id).in('status', ['aktiv','pause']).then(function(res){
        var l = res.data || [];
        if(!l.length) return 0;
        return Promise.all(l.map(function(x){
          var nu = x.pending || {};
          Object.keys(aendret).forEach(function(k){ nu[k] = aendret[k]; });
          return sb.from('listings').update({
            pending: nu,
            pending_note: 'Rettet i appen',
            pending_since: new Date().toISOString()
          }).eq('id', x.id).then(function(){
            return sb.from('price_events').insert({
              listing_id: x.id, kind: 'rettet',
              price: aendret.price || null, from_price: x.price,
              note: 'rettet i appen: ' + Object.keys(aendret).map(function(k){
                return FELT_NAVNE[k] || k;
              }).join(', ')
            });
          });
        })).then(function(){ return l.length; });
      });
  }

  /* ---- Løbenummer, QR og etiketter ----------------------------------------
     Et produkt findes to steder: i appen og i en papkasse. Løbenummeret er
     det, der binder dem sammen — det står på etiketten på pakken, og QR-koden
     ved siden af er det samme nummer, bare så telefonen kan læse det.

     Nummeret kommer fra en sekvens i databasen og bliver aldrig genbrugt, så
     en etiket, der er klistret på en pakke, betyder det samme om et år.

     QR-koden peger på appens EGEN adresse, ikke på noget hos os her — så
     virker iPhonens indbyggede kamera som scanner, uden at der skal åbnes
     noget først. Derfor står adressen fast: en etiket printet fra en Mac skal
     pege samme sted hen som en printet fra telefonen. */

  var APP_URL = 'https://nikolajbak.github.io/vinted-udbakke/';

  function fmtNr(n){ return n ? '#' + String(n).padStart(4, '0') : ''; }
  function qrTekst(nr){ return APP_URL + '#v' + nr; }

  // Bibliotekerne hentes FØRST når de skal bruges. De to skærme her er ikke
  // dem, appen åbnes for, og 300 kB på hver opstart ville betale for noget,
  // der bruges en gang om ugen.
  var HENTET = {};
  function hentScript(url){
    if(HENTET[url]) return HENTET[url];
    HENTET[url] = new Promise(function(ok, nej){
      var el = document.createElement('script');
      el.src = url; el.async = true;
      el.onload = function(){ ok(); };
      el.onerror = function(){ HENTET[url] = null; nej(new Error('kunne ikke hentes')); };
      document.head.appendChild(el);
    });
    return HENTET[url];
  }
  function qrKlar(){
    if(window.qrcode) return Promise.resolve();
    return hentScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js');
  }
  function scannerKlar(){
    if(window.jsQR) return Promise.resolve();
    return hentScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
  }

  // SVG frem for billede: etiketten skal printes, og et punktbillede skaleret
  // op til 26 mm bliver grimt netop dér, hvor det skal kunne læses.
  function qrSvg(tekst){
    var q = window.qrcode(0, 'M');
    q.addData(tekst);
    q.make();
    // Margenen er QR-kodens hvide kant. Standarden beder om fire MODULER, og
    // biblioteket regner margenen i samme enhed som cellSize — ikke i moduler.
    // margin: 4 gav derfor én modulbredde, og en kode uden ordentlig kant er
    // den slags fejl, der først viser sig som en etiket, telefonen ikke vil
    // læse. Målt i den færdige SVG, ikke læst i dokumentationen.
    var CELLE = 4;
    return q.createSvgTag({ cellSize: CELLE, margin: CELLE * 4, scalable: true });
  }

  /* ---- Slå op på nummer -------------------------------------------------- */

  // Et scan kan give tre ting: appens egen adresse med #v bagpå, et nøgent
  // tal, eller noget helt andet. De to første er vores.
  function nummerFra(tekst){
    if(!tekst) return null;
    var t = String(tekst).trim();
    var m = t.match(/#v(\d+)\s*$/);
    if(m) return Number(m[1]);
    if(/^#?0*\d{1,9}$/.test(t)) return Number(t.replace(/^#/, ''));
    return null;
  }

  function aabnNummer(nr, sig){
    if(!nr){ if(sig) sig('Det er ikke en etiket herfra.'); return; }
    // Kartoteket først: er varen allerede hentet, skal der ikke ventes på
    // netværket for at vise den.
    var kendt = Object.keys(rows).map(function(k){ return rows[k]; })
      .filter(function(d){ return Number(d.nr) === Number(nr); })[0];
    if(kendt){ openDetail(kendt.id); return; }
    if(sig) sig('Slår ' + fmtNr(nr) + ' op …');
    sb.from('drafts').select('*').eq('nr', nr).maybeSingle().then(function(res){
      if(res.error || !res.data){
        if(sig) sig('Der er ingen vare med nummer ' + fmtNr(nr) + '.');
        return;
      }
      rows[res.data.id] = res.data;
      openDetail(res.data.id);
    });
  }

  /* ---- Scanner ----------------------------------------------------------- */

  var scanStream = null, scanTimer = null;

  function stopScan(){
    if(scanTimer){ clearInterval(scanTimer); scanTimer = null; }
    if(scanStream){
      scanStream.getTracks().forEach(function(t){ t.stop(); });
      scanStream = null;
    }
    var v = $('scan-video');
    if(v) v.srcObject = null;
  }

  function scanBesked(t){ var el = $('scan-note'); if(el) el.textContent = t; }

  function startScan(){
    var video = $('scan-video');
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      scanBesked('Denne browser giver ikke adgang til kameraet. Tast løbenummeret herunder i stedet.');
      return;
    }
    scanBesked('Beder om kameraet …');
    scannerKlar().then(function(){
      return navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false
      });
    }).then(function(stream){
      // Nåede du at gå tilbage imens, skal kameraet ikke tændes bagefter.
      if(screenEl('scan').hidden){ stream.getTracks().forEach(function(t){ t.stop(); }); return; }
      scanStream = stream;
      video.srcObject = stream;
      video.play();
      scanBesked('Hold kameraet hen over QR-koden på etiketten.');
      var lae = document.createElement('canvas');
      var ctx = lae.getContext('2d', { willReadFrequently: true });
      scanTimer = setInterval(function(){
        if(!video.videoWidth) return;
        // Halv opløsning: en QR-kode fylder rigeligt, og det halverer arbejdet
        // på en telefon, der samtidig skal vise billedet.
        lae.width = Math.round(video.videoWidth / 2);
        lae.height = Math.round(video.videoHeight / 2);
        ctx.drawImage(video, 0, 0, lae.width, lae.height);
        var d;
        try{ d = ctx.getImageData(0, 0, lae.width, lae.height); }catch(e){ return; }
        var fund = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
        if(!fund) return;
        var nr = nummerFra(fund.data);
        if(!nr){ scanBesked('Den kode hører ikke til en vare her.'); return; }
        stopScan();
        if(navigator.vibrate) try{ navigator.vibrate(30); }catch(e){}
        aabnNummer(nr, scanBesked);
      }, 180);
    }).catch(function(err){
      scanBesked(err && err.name === 'NotAllowedError'
        ? 'Kameraet fik ikke lov. Giv Safari adgang, eller tast løbenummeret herunder.'
        : 'Kameraet kunne ikke startes. Tast løbenummeret herunder i stedet.');
    });
  }

  $('scan-form').addEventListener('submit', function(e){
    e.preventDefault();
    aabnNummer(nummerFra($('scan-nr').value), scanBesked);
  });
  $('fod-scan').addEventListener('click', function(){
    show('scan'); $('scan-nr').value = ''; startScan();
  });

  /* ---- Etiketter --------------------------------------------------------- */

  var LBL = [];          // varerne på skærmen
  var LBL_VALGT = {};    // dem der skal med på arket

  function hentEtiketter(){
    var krop = $('lbl-body');
    krop.innerHTML = '<div class="skel" id="lbl-skel"></div>';
    visSkelet($('lbl-skel'), 4);
    $('lbl-footer').hidden = true;
    qrKlar().then(function(){
      return sb.from('drafts').select('id, nr, title, price, status, image_url')
        .neq('status', 'kasseret').order('nr', { ascending: false }).limit(200);
    }).then(function(res){
      if(res.error){
        krop.innerHTML = '<div class="empty" id="lbl-fejl"></div>';
        visFejl($('lbl-fejl'), 'Listen kunne ikke hentes',
          res.error.message || 'Forbindelsen svarede ikke.', hentEtiketter);
        return;
      }
      LBL = res.data || [];
      LBL_VALGT = {};
      LBL.forEach(function(d){ LBL_VALGT[d.id] = true; });
      tegnEtiketter();
    }).catch(function(){
      krop.innerHTML = '<div class="empty" id="lbl-fejl"></div>';
      visFejl($('lbl-fejl'), 'QR-koderne kunne ikke hentes',
        'Biblioteket til QR-koder kunne ikke hentes. Prøv igen, når du er online.',
        hentEtiketter);
    });
  }

  function tegnEtiketter(){
    var krop = $('lbl-body');
    if(!LBL.length){
      krop.innerHTML = '<div class="empty"><h3>Ingen varer endnu</h3>' +
        '<p>Hver vare får sit løbenummer, så snart billedserien er taget.</p></div>';
      $('lbl-footer').hidden = true;
      return;
    }
    var h = '<p class="note lbl-intro">Hver vare har sit eget løbenummer, og QR-koden ' +
      'er det samme nummer. Scanner du den med telefonens kamera, åbner varen her i appen. ' +
      'Arket er sat op til 21 etiketter pr. A4 (63,5 × 38,1 mm) — print på almindeligt papir ' +
      'og klip, eller på etiketark med samme inddeling. Tjek det første ark, før du printer mange.</p>' +
      '<label class="lbl-start">Start på plads nr.' +
      '<input type="number" id="lbl-start" min="1" max="' + PR_ARK + '" value="1"></label>' +
      '<p class="note">Er det første ark halvt brugt, så begynd, hvor der er tomt. ' +
      'Pladserne tælles fra øverste venstre hjørne, række for række.</p>';
    h += '<div class="sect">' + LBL.map(function(d){
      return '<label class="lbl-row">' +
        '<input type="checkbox" data-id="' + esc(d.id) + '"' +
          (LBL_VALGT[d.id] ? ' checked' : '') + '>' +
        '<span class="lbl-qr">' + qrSvg(qrTekst(d.nr)) + '</span>' +
        '<span class="lbl-tekst"><span class="nr mono">' + esc(fmtNr(d.nr)) + '</span>' +
        '<span class="t">' + esc(d.title || 'Uden titel') + '</span>' +
        '<span class="s">' + esc([d.price, d.status].filter(Boolean).join(' · ')) + '</span></span>' +
      '</label>';
    }).join('') + '</div>';
    krop.innerHTML = h;

    Array.prototype.forEach.call(krop.querySelectorAll('input[type=checkbox]'), function(c){
      c.addEventListener('change', function(){
        LBL_VALGT[c.getAttribute('data-id')] = c.checked;
        opdaterEtiketFod();
      });
    });
    opdaterEtiketFod();
  }

  function valgteEtiketter(){
    return LBL.filter(function(d){ return LBL_VALGT[d.id]; });
  }

  function opdaterEtiketFod(){
    var n = valgteEtiketter().length;
    var fod = $('lbl-footer');
    fod.innerHTML = '<button type="button" class="btn btn-primary" id="lbl-print"' +
      (n ? '' : ' disabled') + '>Udskriv ' + n +
      (n === 1 ? ' etiket' : ' etiketter') + '</button>';
    fod.hidden = false;
    if(n) $('lbl-print').addEventListener('click', udskrivEtiketter);
    $('lbl-alle').textContent = n === LBL.length ? 'Fravælg alle' : 'Vælg alle';
  }

  $('lbl-alle').addEventListener('click', function(){
    var alle = valgteEtiketter().length === LBL.length;
    LBL.forEach(function(d){ LBL_VALGT[d.id] = !alle; });
    Array.prototype.forEach.call($('lbl-body').querySelectorAll('input[type=checkbox]'),
      function(c){ c.checked = !alle; });
    opdaterEtiketFod();
  });

  var PR_ARK = 21;

  function udskrivEtiketter(){
    var valgte = valgteEtiketter();
    if(!valgte.length) return;

    // Et brugt etiketark har huller i toppen. Uden et startpunkt ville de
    // resterende etiketter blive printet oven i de tomme pladser — altsaa paa
    // bagpapiret — og arket var spildt.
    var start = Math.max(0, Math.min(PR_ARK - 1, (parseInt($('lbl-start').value, 10) || 1) - 1));
    var felter = [];
    for(var t = 0; t < start; t++) felter.push('<div class="etiket etiket-tom"></div>');
    valgte.forEach(function(d){
      felter.push('<div class="etiket">' +
        '<div class="etiket-qr">' + qrSvg(qrTekst(d.nr)) + '</div>' +
        '<div class="etiket-tekst">' +
          '<div class="etiket-nr">' + esc(fmtNr(d.nr)) + '</div>' +
          '<div class="etiket-titel">' + esc(d.title || '') + '</div>' +
          '<div class="etiket-pris">' + esc(d.price || '') + '</div>' +
        '</div></div>');
    });

    // Arkene deles op her, ikke af browseren. En grid, der selv skal finde ud
    // af hvor siden slutter, sætter før eller siden en række hen over
    // sideskiftet — og saa er de etiketter ubrugelige.
    var ark = [];
    for(var i = 0; i < felter.length; i += PR_ARK){
      ark.push('<div class="ark-side">' + felter.slice(i, i + PR_ARK).join('') + '</div>');
    }
    $('print-sheet').innerHTML = ark.join('');
    // Safari i en installeret PWA aabner ikke altid et printpanel. Sker der
    // ingenting, er det dét, der er sket — og saa skal arket printes fra en
    // computer i stedet. Derfor staar det i beskeden og ikke kun i hovedet.
    setTimeout(function(){
      try{ window.print(); }
      catch(e){ toast('Print kunne ikke åbnes — prøv fra en computer'); }
    }, 60);
  }

  $('m-labels').addEventListener('click', function(){ show('labels'); hentEtiketter(); });

  // Telefonens indbyggede kamera aabner bare adressen fra QR-koden. Den
  // ender her, som #v42 bagest i adressen — og skal foere hen til varen.
  // Maerket ryddes med det samme, saa en genindlaesning ikke haevder, at du
  // lige har scannet noget.
  function aabnFraAdresse(){
    var nr = nummerFra(location.hash || '');
    if(!nr) return;
    try{ history.replaceState(history.state, '', location.pathname + location.search); }catch(e){}
    aabnNummer(nr);
  }
  window.addEventListener('hashchange', function(){ if(started) aabnFraAdresse(); });

  /* ---- Prisvagt -----------------------------------------------------------
     En vare, der ikke bliver solgt, er ikke faerdig — den er bare stille. Her
     staar alt det, der ligger ude: hvor laenge, hvor mange der har hjertet
     det, og hvad prisen har vaeret undervejs.

     Beslutningen om en ny pris ligger paa serveren, men den kan hverken se
     Vinted eller skrive i Vinteds formular. Derfor ender hver aendring som ét
     tryk her, der aabner annoncen — resten goer automatikken selv. */

  var VAGT_EVENTS = {};   // listing-id -> prishistorik

  // Hvilke felter venter paa at blive skrevet ind i annoncen? Baade
  // prisvagtens forslag og dine egne rettelser ligger i den samme postkasse.
  var FELT_NAVNE = { price:'pris', title:'titel', description:'beskrivelse', fotos:'billedrækkefølge' };
  function venterFelter(l){
    var p = (l && l.pending) || null;
    if(!p) return [];
    return Object.keys(FELT_NAVNE).filter(function(k){
      return p[k] !== undefined && p[k] !== null && p[k] !== '';
    }).map(function(k){ return FELT_NAVNE[k]; });
  }

  function dageSiden(iso){
    if(!iso) return 0;
    var t = new Date(iso).getTime();
    if(isNaN(t)) return 0;
    return Math.max(0, Math.round((Date.now() - t) / 86400000));
  }
  function omDage(iso){
    if(!iso) return '';
    var d = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
    if(isNaN(d)) return '';
    if(d <= 0) return 'pristjek i dag';
    return 'pristjek om ' + d + (d === 1 ? ' dag' : ' dage');
  }
  function prisKaede(l){
    var e = (VAGT_EVENTS[l.id] || []).filter(function(x){ return x.kind === 'aendret'; });
    if(!e.length) return kr(l.start_price);
    var k = [e[0].from_price];
    e.forEach(function(x){ k.push(x.price); });
    return k.map(function(x){ return Math.round(Number(x)) + ',00'; }).join(' → ') + ' kr';
  }

  // Prisvagtens seneste dom over annoncen, i hele saetninger. Uden den stod
  // der kun »tjekkes ved næste besøg på Vinted«, og man kunne ikke se, om
  // vagten overhovedet havde kigget, eller hvad den havde fundet.
  function sidsteMaaling(l){
    var e = (VAGT_EVENTS[l.id] || []).filter(function(x){ return x.kind === 'maalt'; });
    return e.length ? e[e.length - 1] : null;
  }
  function vagtDom(l){
    var m = sidsteMaaling(l);
    if(!l.last_check_at && !m) return 'Ikke tjekket endnu';
    var t = 'Tjekket ' + relTime(l.last_check_at || m.at);
    if(m && m.median && m.comparables){
      t += ' · ' + m.comparables + ' lignende til ca. ' + kr(m.median);
    }
    return t;
  }
  function naesteTjek(l){
    if(!l.next_check_at) return '';
    var d = Math.round((new Date(l.next_check_at).getTime() - Date.now()) / 86400000);
    if(isNaN(d)) return '';
    if(d < 0) return 'Tjekkes, så snart Vinted er åben i Safari';
    if(d === 0) return 'Næste tjek: i dag';
    return 'Næste tjek: om ' + d + (d === 1 ? ' dag' : ' dage');
  }
  function nedsat(l){
    return (VAGT_EVENTS[l.id] || []).filter(function(x){ return x.kind === 'aendret'; }).length;
  }
  // En aendring, der har ventet over et doegn, er ikke naaet ud af sig selv:
  // saa har Vinted ikke vaeret aaben i Safari. Dét er noget, du skal vide.
  function sidderFast(l){
    if(!venterFelter(l).length) return false;
    var t = l.pending_since ? new Date(l.pending_since).getTime() : 0;
    return !t || Date.now() - t > 86400000;
  }

  // Prisvagtens nedsaettelse, der venter paa dit ja (listings.forslag).
  function harForslag(l){
    return !!(l && l.status === 'aktiv' && l.forslag && Number(l.forslag.price) > 0);
  }

  function vagtRaekke(l){
    var dage = dageSiden(l.listed_at);
    var n = nedsat(l);
    var h = '<div class="vagt-row" data-l="' + esc(l.id) + '">';
    h += '<button type="button" class="vagt-top" data-v="vis"><span class="t">' + esc(l.title || 'Uden titel') + '</span>' +
         '<span class="pris">' + esc(kr(l.price)) + '</span></button>';
    h += '<div class="s">Ude ' + dage + (dage === 1 ? ' dag' : ' dage') +
         ' · ♥ ' + (l.favourites || 0) +
         (n ? ' · pris ' + esc(prisKaede(l)) : '') + '</div>';

    var venter = venterFelter(l);
    if(harForslag(l)){
      var fo = l.forslag;
      h += '<div class="vagt-forslag godkend"><b>Foreslår ' + esc(kr(fo.price)) + ' <s>' + esc(kr(l.price)) + '</s></b>' +
           (fo.note ? '<span>' + esc(fo.note) + '</span>' : '') +
           (venter.length ? '<span>Venter også: ' + esc(venter.join(', ')) + '</span>' : '') +
           '<div class="vagt-knapper"><button type="button" class="btn btn-secondary" data-v="afvis">Afvis</button>' +
           '<button type="button" class="btn btn-primary" data-v="godkend">Godkend ' + esc(kr(fo.price)) + '</button></div></div>';
    } else if(venter.length){
      var pv = l.pending && l.pending.price;
      var andre = venter.filter(function(x){ return x !== 'pris'; });
      h += '<div class="vagt-forslag' + (sidderFast(l) ? ' fast' : '') + '"><b>' +
           (pv ? 'Ny pris: ' + esc(kr(pv)) + ' <s>' + esc(kr(l.price)) + '</s>' : 'Din rettelse: ' + esc(venter.join(', '))) + '</b>' +
           (pv && andre.length ? '<span>Også: ' + esc(andre.join(', ')) + '</span>' : '') +
           (pv && l.pending_note ? '<span>' + esc(l.pending_note) + '</span>' : '') +
           '<span>' + (sidderFast(l)
             ? 'Besluttet ' + esc(relTime(l.pending_since) || 'for over et døgn siden') + ', men Vinted har ikke været åben i Safari siden.'
             : 'Sættes af sig selv, næste gang Vinted er åben i Safari.') + '</span>' +
           '<button type="button" class="btn ' + (sidderFast(l) ? 'btn-primary' : 'btn-secondary') + '" data-v="saet">Sæt den på Vinted nu</button></div>';
    } else if(l.status === 'pause'){
      h += '<div class="vagt-stop"><span>Sat på pause af dig. Prisen bliver, hvor den er.</span>' +
           '<button type="button" class="btn btn-secondary" data-v="pause">Genoptag</button></div>';
    } else if(!l.auto){
      h += '<div class="vagt-stop"><span>Sætter ikke længere ned' + (l.note ? ': ' + esc(l.note) : '.') + '</span>' +
           '<button type="button" class="btn btn-secondary" data-v="igen">Tjek den igen</button></div>';
    } else {
      h += '<div class="vagt-dom">' + esc(vagtDom(l)) + '</div>';
      var nt = naesteTjek(l);
      if(nt) h += '<div class="s dim">' + esc(nt) + '</div>';
    }

    // Alt det, man sjaeldent skal bruge, bag ét fold.
    h += '<details class="vagt-mere"><summary>Mindstepris, pause og købers spørgsmål</summary>' +
         '<label class="vagt-bund">Mindstepris' +
         '<input type="number" inputmode="numeric" min="15" step="5" value="' +
         esc(String(l.floor_price == null ? '' : l.floor_price)) + '" ' +
         'placeholder="' + esc(String(Math.max(15, Math.round(l.start_price * 0.4)))) + '" data-v="bund"></label>' +
         '<p class="note">Prisen sættes aldrig under den. Står feltet tomt, er det 40 % af startprisen.</p>' +
         (l.status === 'aktiv' ? '<div class="vagt-knapper"><button type="button" class="btn btn-quiet" data-v="pause">Sæt på pause</button></div>' : '') +
         '<div class="vagt-svar-blok"><div class="label">Svar en køber</div>' +
         '<textarea class="vagt-besked" rows="3" placeholder="Indsæt købers besked"></textarea>' +
         '<label class="vagt-bund">Bud, hvis der er et' +
         '<input type="number" inputmode="numeric" min="1" class="vagt-bud" placeholder="kr"></label>' +
         '<div class="vagt-knapper"><button type="button" class="btn btn-quiet" data-v="svar">Skriv et svar</button></div>' +
         '<div class="vagt-svar" hidden></div>' +
         '<p class="note">Svaret sendes ikke — du kopierer det selv over i Vinted.</p></div>' +
         '<div class="salg-form"><input type="number" inputmode="numeric" min="1" class="salg-pris" ' +
         'placeholder="' + esc(String(l.price)) + '" aria-label="Salgspris i kroner">' +
         '<button type="button" class="btn btn-secondary" data-v="solgt">Solgt for det</button></div>' +
         '</details></div>';
    return h;
  }

  var VAGT_PULS = {};
  function hentVagt(){
    var krop = $('vagt-body');
    krop.innerHTML = '<div class="skel" id="vagt-skel"></div>';
    visSkelet($('vagt-skel'), 3);
    $('vagt-footer').hidden = true;

    Promise.all([
      sb.from('listings').select('*').order('next_check_at', { ascending:true }).limit(100),
      sb.from('puls').select('navn, sidst, detalje').in('navn', ['prisvagt', 'prisvagt-dagligt'])
    ]).then(function(r){
        var res = r[0];
        VAGT_PULS = {};
        (r[1].data || []).forEach(function(x){ VAGT_PULS[x.navn] = x; });
        if(res.error){
          krop.innerHTML = '<div class="empty" id="vagt-fejl"></div>';
          visFejl($('vagt-fejl'), 'Prisvagten kunne ikke hentes',
            res.error.message || 'Forbindelsen svarede ikke.', hentVagt);
          return;
        }
        var alle = res.data || [];
        var ids = alle.map(function(l){ return l.id; });
        if(!ids.length){ tegnVagt(alle); return; }
        sb.from('price_events').select('*').in('listing_id', ids)
          .order('at', { ascending:true }).limit(1000)
          .then(function(ev){
            VAGT_EVENTS = {};
            (ev.data || []).forEach(function(e){
              (VAGT_EVENTS[e.listing_id] = VAGT_EVENTS[e.listing_id] || []).push(e);
            });
            tegnVagt(alle);
          });
      });
  }

  // Øverst: virker prisvagten? Ét kort, der svarer paa det, du vil vide —
  // hvornaar den sidst kiggede, og om noget staar i stampe.
  function vagtStatus(aktive){
    var vagter = aktive.filter(function(l){ return l.status === 'aktiv' && l.auto; });
    var sidst = null;
    aktive.forEach(function(l){ if(l.last_check_at && (!sidst || l.last_check_at > sidst)) sidst = l.last_check_at; });
    var p = VAGT_PULS.prisvagt, dagligt = VAGT_PULS['prisvagt-dagligt'];
    if(p && (!sidst || p.sidst > sidst)) sidst = p.sidst;
    var forsinket = vagter.filter(function(l){
      return new Date(l.next_check_at).getTime() < Date.now() - 86400000;
    }).length;
    var dagligOk = dagligt && friskhed(dagligt.sidst, 2);
    var galt = forsinket > 0 && !dagligOk;

    var h = '<div class="vagt-status' + (galt ? ' galt' : '') + '">' +
      '<span class="tjek-prik ' + (galt ? 'maaske' : 'ok') + '" aria-hidden="true"></span><div>' +
      '<b>' + (vagter.length
        ? 'Holder øje med ' + vagter.length + (vagter.length === 1 ? ' annonce' : ' annoncer')
        : 'Ingen annoncer at holde øje med lige nu') + '</b>' +
      '<span>' + (sidst ? 'Sidste tjek ' + esc(relTime(sidst)) : 'Ikke tjekket endnu') +
        (dagligOk ? ' · dagligt tjek slået til' : '') + '</span>';
    if(galt){
      h += '<span>' + forsinket + (forsinket === 1 ? ' annonce venter' : ' annoncer venter') +
        ' på et tjek. Prisvagten kan kun se Vinted gennem din Safari — med det daglige tjek sker det af sig selv.</span>' +
        '<button type="button" class="btn btn-primary" id="vagt-dagligt">Slå dagligt tjek til</button>';
    } else if(!dagligOk){
      h += '<button type="button" class="vagt-link" id="vagt-dagligt">Tjek hver dag af sig selv →</button>';
    }
    h += '</div></div>';
    return h;
  }

  function vagtAfsnit(titel, under, raekker){
    if(!raekker.length) return '';
    return '<div class="sect vagt-afsnit"><div class="label">' + esc(titel) + ' · ' + raekker.length + '</div>' +
      (under ? '<p class="note">' + under + '</p>' : '') +
      raekker.map(vagtRaekke).join('') + '</div>';
  }

  function tegnVagt(alle){
    var krop = $('vagt-body');
    var aktive = alle.filter(function(l){ return l.status === 'aktiv' || l.status === 'pause'; });
    var solgte = alle.filter(function(l){ return l.status === 'solgt' || l.status === 'afsluttet'; });
    $('vagt-footer').hidden = true;

    if(!alle.length){
      krop.innerHTML = '<div class="empty"><h3>Ingen annoncer at holde øje med</h3>' +
        '<p>Når du lægger en annonce op på Vinted med automatikken, kommer den her af sig selv. ' +
        'Så holder prisvagten øje med den, indtil den er solgt.</p>' +
        '<p>Er annoncen lagt op uden om appen, så tilknyt den på udkastets side.</p></div>';
      return;
    }

    var tilGodkendelse = aktive.filter(harForslag);
    var paaVej = aktive.filter(function(l){ return !harForslag(l) && venterFelter(l).length; });
    var fri = aktive.filter(function(l){ return !harForslag(l) && !venterFelter(l).length && (l.status === 'pause' || !l.auto); });
    var oeje = aktive.filter(function(l){ return tilGodkendelse.indexOf(l) < 0 && paaVej.indexOf(l) < 0 && fri.indexOf(l) < 0; });
    // Den, der er tjekket senest, er mindst interessant; den, der snart
    // tjekkes, oeverst.
    oeje.sort(function(a, b){ return String(a.next_check_at).localeCompare(String(b.next_check_at)); });

    var h = vagtStatus(aktive);
    h += vagtAfsnit('Til godkendelse', 'Prisvagten sætter ingen pris ned, før du har sagt ja. Det godkendte sættes af sig selv, næste gang Vinted er åben i Safari.', tilGodkendelse);
    if(tilGodkendelse.length > 1){
      h += '<div class="vagt-knapper vagt-alle"><button type="button" class="btn btn-primary" id="vagt-godkend-alle">Godkend alle ' +
        tilGodkendelse.length + '</button></div>';
    }
    h += vagtAfsnit('Ny pris på vej', '', paaVej);
    h += vagtAfsnit('Holder øje', 'Prisen sammenlignes med lignende varer på Vinted. Står den for højt, foreslås en lavere pris til din godkendelse — aldrig under mindsteprisen.', oeje);
    h += vagtAfsnit('Rører ikke prisen', '', fri);
    if(solgte.length){
      h += '<details class="sect"><summary class="label">Solgt eller taget ned · ' + solgte.length + '</summary>' +
        solgte.map(function(l){
          return '<div class="hist-row"><div><div class="t">' + esc(l.title || '') + '</div>' +
            '<div class="s">' + (l.sold_price != null ? 'solgt for ' + esc(kr(l.sold_price)) : esc(kr(l.price))) + ' · lå ' +
            (dageSiden(l.listed_at) - dageSiden(l.sold_at)) + ' dage · ' +
            esc(prisKaede(l)) + '</div></div></div>';
        }).join('') + '</details>';
    }
    h += '<div class="sect laer" id="laer"></div>';
    krop.innerHTML = h;
    hentLaerdomme();

    var dk = $('vagt-dagligt');
    if(dk) dk.addEventListener('click', aabnDagligt);
    var ga = $('vagt-godkend-alle');
    if(ga) ga.addEventListener('click', function(){
      ga.disabled = true;
      Promise.all(tilGodkendelse.map(godkendForslag)).then(function(r){
        var ok = r.filter(Boolean).length;
        toast(ok + ' ' + (ok === 1 ? 'pris godkendt' : 'priser godkendt') + ' — sættes, næste gang Vinted er åben');
        hentVagt(); opdaterVagtTal();
      });
    });

    Array.prototype.forEach.call(krop.querySelectorAll('.vagt-row [data-v]'), function(el){
      var raekke = el.closest('.vagt-row');
      var l = alle.filter(function(x){ return x.id === raekke.getAttribute('data-l'); })[0];
      if(!l) return;
      var v = el.getAttribute('data-v');
      if(v === 'bund'){
        el.addEventListener('change', function(){
          var n = prisTal(el.value);
          sb.from('listings').update({ floor_price: isFinite(n) && n > 0 ? n : null })
            .eq('id', l.id).then(function(){ toast('Mindsteprisen er gemt'); });
        });
        return;
      }
      el.addEventListener('click', function(){ vagtHandling(v, l, el); });
    });
  }

  // Opsaetningens trin for det daglige tjek, foldet ud.
  function aabnDagligt(){
    show('opsaet'); tegnTjek();
    var t = document.querySelector('.trin[data-tjek="dagligt"]');
    if(t){ t.open = true; setTimeout(function(){ t.scrollIntoView({ block:'start', behavior:'smooth' }); }, 50); }
  }

  function vagtHandling(v, l, btn){
    if(v === 'vis'){
      if(l.draft_id && rows[l.draft_id]) openDetail(l.draft_id);
      else if(l.url) aabnUdad(l.url);
      return;
    }
    if(v === 'igen'){
      sb.from('listings').update({ auto: true, next_check_at: new Date().toISOString() }).eq('id', l.id).then(function(){
        toast('Tjekkes, næste gang Vinted er åben');
        hentVagt();
      });
      return;
    }
    if(v === 'godkend' || v === 'afvis'){
      btn.disabled = true;
      (v === 'godkend' ? godkendForslag(l) : afvisForslag(l)).then(function(ok){
        if(ok) toast(v === 'godkend' ? 'Godkendt — sættes, næste gang Vinted er åben' : 'Afvist — prisen bliver, hvor den er');
        else btn.disabled = false;
        hentVagt(); opdaterVagtTal();
      });
      return;
    }
    if(v === 'saet'){
      aabnUdad('https://www.vinted.dk/items/' + l.external_id + '/edit#udbakke=send');
      return;
    }
    if(v === 'pause'){
      var ny = l.status === 'pause' ? 'aktiv' : 'pause';
      sb.from('listings').update({ status: ny }).eq('id', l.id).then(function(){
        toast(ny === 'pause' ? 'Sat på pause' : 'Prisvagten er i gang igen');
        hentVagt();
      });
      return;
    }
    if(v === 'svar'){
      svarKoeber(l, btn);
      return;
    }
    if(v === 'solgt'){
      // Salgsprisen er dét, der kan laeres af. Udbudsprisen er ikke svaret:
      // et bud, du tog imod, ligger under den.
      var kr = prisTal(btn.parentNode.querySelector('.salg-pris').value);
      if(!isFinite(kr) || kr <= 0){ toast('Skriv salgsprisen i hele kroner'); return; }
      btn.disabled = true;
      markerSolgt(l, kr).then(function(){ btn.disabled = false; });
    }
  }

  // Godkendt: prisen lægges i pending som en rettelse fra dig, og runneren
  // sætter den, næste gang Vinted er åben. Forslaget ryddes.
  function godkendForslag(l){
    var fo = l.forslag, nu = Object.assign({}, l.pending || {}, { price: Number(fo.price) });
    return sb.from('listings').update({
      pending: nu, pending_note: 'Godkendt af dig: ' + (fo.note || 'prisvagtens forslag'),
      pending_since: new Date().toISOString(), forslag: null
    }).eq('id', l.id).then(function(res){
      if(res.error){ toast('Kunne ikke gemme: ' + res.error.message); return false; }
      return sb.from('price_events').insert({ listing_id: l.id, kind: 'godkendt', price: Number(fo.price),
        from_price: Number(l.price), note: 'godkendt af dig' }).then(function(){ return true; });
    });
  }
  // Afvist: prisen bliver, og vagten kigger først igen om en uge. Prisvagten
  // ser afvisningen i historikken og foreslår ikke bare det samme igen.
  function afvisForslag(l){
    var fo = l.forslag;
    return sb.from('listings').update({
      forslag: null, next_check_at: new Date(Date.now() + 7 * 86400000).toISOString()
    }).eq('id', l.id).then(function(res){
      if(res.error){ toast('Kunne ikke gemme: ' + res.error.message); return false; }
      return sb.from('price_events').insert({ listing_id: l.id, kind: 'afvist', price: Number(fo.price),
        from_price: Number(l.price), note: 'afvist af dig' }).then(function(){ return true; });
    });
  }

  function svarKoeber(l, btn){
    var raekke = btn.closest('.vagt-row');
    var besked = raekke.querySelector('.vagt-besked').value.trim();
    var bud = prisTal(raekke.querySelector('.vagt-bud').value);
    var ud = raekke.querySelector('.vagt-svar');
    if(!besked && !(bud > 0)){ toast('Indsæt købers besked eller bud'); return; }
    var p = l.published || {};
    btn.disabled = true; btn.textContent = 'Skriver …';
    fetch(FILL_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode:'negotiate', platform: l.platform, listing: l.id,
        buyerMessage: besked, offer: bud > 0 ? bud : 0,
        item: { title: p.title || l.title, price: l.price, description: p.description,
                brand: p.brand, size: p.size, condition: p.condition } })
    }).then(function(r){ return r.json(); }).then(function(r){
      btn.disabled = false; btn.textContent = 'Skriv et svar';
      if(!r || r.error){ toast('Intet svar: ' + ((r && r.error) || 'ukendt fejl')); return; }
      var h = '';
      if(r.counterPrice) h += '<b>Modbud: ' + esc(kr(r.counterPrice)) + '</b>';
      if(r.intent === 'accept') h += '<b>Tag imod buddet</b>';
      if(r.message) h += '<p class="vagt-svar-tekst">' + esc(r.message) + '</p>';
      if(r.note) h += '<span>' + esc(r.note) + '</span>';
      if(r.intent === 'defer') h += '<span>Det kan kun du svare på.</span>';
      if(r.message) h += '<button type="button" class="btn btn-primary vagt-kopier">Kopiér svaret</button>';
      ud.innerHTML = h; ud.hidden = false;
      var k = ud.querySelector('.vagt-kopier');
      if(k) k.addEventListener('click', function(){
        if(navigator.clipboard) navigator.clipboard.writeText(r.message).then(function(){ toast('Svaret er kopieret'); });
      });
    }).catch(function(){
      btn.disabled = false; btn.textContent = 'Skriv et svar';
      toast('Kunne ikke nå serveren');
    });
  }

  /* ---- Det salgene har laert -------------------------------------------
     En gennemgang paa serveren sammenligner det solgte med det stille og
     skriver korte erfaringer, der laegges ind, naar naeste annonce skrives.
     Her kan du se dem, se hvad de bygger paa, og slaa dem fra. En erfaring,
     du slaar fra, foreslaas ikke igen. */

  // Billed-erfaringer gaar ikke i nogen prompt: det er dig, der tager billederne.
  var LAER_NAVN = { tekst:'Tekst', pris:'Pris', billeder:'Billeder — til dig, når du fotograferer', kommunikation:'Svar til købere' };
  var LAER_SIDST = null;   // seneste svar fra gennemgangen i denne session

  function hentLaerdomme(){
    var boks = $('laer');
    if(!boks) return;
    sb.from('laerdomme').select('*').order('created_at', { ascending:true }).then(function(res){
      tegnLaerdomme(res.data || []);
    });
  }

  function tegnLaerdomme(rk){
    var boks = $('laer');
    if(!boks) return;
    var aktive = rk.filter(function(x){ return x.aktiv; });
    var fra = rk.filter(function(x){ return !x.aktiv; });
    var h = '<div class="label">Det salgene har lært</div>';
    if(LAER_SIDST && LAER_SIDST.forTidligt){
      h += '<p class="note">' + esc(LAER_SIDST.mangler) + '</p>';
    } else if(LAER_SIDST && LAER_SIDST.overblik){
      h += '<p class="note">' + esc(LAER_SIDST.overblik) + '</p>';
    }
    if(!aktive.length && !(LAER_SIDST && LAER_SIDST.forTidligt)){
      h += '<p class="note">Ingen erfaringer endnu. Når nok varer er solgt — eller har stået stille — ' +
           'finder gennemgangen ud af, hvad de solgte har til fælles, og bruger det i næste annonce.</p>';
    }
    h += aktive.concat(fra).map(function(x){
      return '<div class="laer-row' + (x.aktiv ? '' : ' fra') + '" data-laer="' + esc(x.id) + '">' +
        '<div class="laer-top"><span class="laer-omr">' + esc(LAER_NAVN[x.omraade] || x.omraade) + '</span>' +
        '<label class="laer-til"><input type="checkbox"' + (x.aktiv ? ' checked' : '') + '> i brug</label></div>' +
        '<p>' + esc(x.tekst) + '</p>' +
        '<div class="s">' + esc(x.grundlag || '') + (x.varer && x.varer.length ? ' · nr. ' + esc(x.varer.join(', ')) : '') + '</div>' +
        '</div>';
    }).join('');
    h += '<div class="vagt-knapper"><button type="button" class="btn btn-quiet" id="laer-nu">Lær af salgene nu</button></div>';
    boks.innerHTML = h;

    $('laer-nu').addEventListener('click', function(){ laerNu(false); });
    Array.prototype.forEach.call(boks.querySelectorAll('.laer-row input'), function(cb){
      cb.addEventListener('change', function(){
        var id = cb.closest('.laer-row').getAttribute('data-laer');
        sb.from('laerdomme').update({ aktiv: cb.checked, slaaet_fra: cb.checked ? null : new Date().toISOString() })
          .eq('id', id).then(function(res){
            if(res.error){ toast('Kunne ikke gemme'); cb.checked = !cb.checked; return; }
            toast(cb.checked ? 'Bruges i næste annonce' : 'Slået fra — foreslås ikke igen');
            hentLaerdomme();
          });
      });
    });
  }

  function laerNu(stille){
    var knap = $('laer-nu');
    if(knap){ knap.disabled = true; knap.textContent = 'Gennemgår salgene …'; }
    fetch(FILL_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode:'laer' })
    }).then(function(r){ return r.json(); }).then(function(r){
      if(!r || r.error){ if(!stille) toast('Gennemgangen fejlede: ' + ((r && r.error) || 'ukendt fejl')); }
      else {
        LAER_SIDST = r;
        if(!stille) toast(r.forTidligt ? 'For tidligt at lære noget endnu'
          : (r.erfaringer.length ? r.erfaringer.length + (r.erfaringer.length === 1 ? ' erfaring' : ' erfaringer') + ' fundet'
                                 : 'Ingen sikre mønstre endnu'));
      }
      hentLaerdomme();
    }).catch(function(){
      if(!stille) toast('Kunne ikke nå serveren');
      hentLaerdomme();
    });
  }

  // Tallet i menuen: hvor mange varer venter paa dig lige nu.
  function opdaterVagtTal(){
    sb.from('listings').select('id, pending, pending_since, status, forslag')
      .in('status', ['aktiv', 'pause']).then(function(res){
        var n = (res.data || []).filter(function(l){ return sidderFast(l) || harForslag(l); }).length;
        ['vagt-tal', 'fod-vagt-tal'].forEach(function(id){
          var el = $(id);
          if(!el) return;
          el.textContent = String(n);
          el.hidden = !n;
        });
      });
  }

  /* ---- Hvad skal jeg koebe igen? ---------------------------------------
     Kun dine egne salg, ikke Vinted som helhed. Serveren (mode:'indkob')
     regner tallene pr. kategori og pr. produkt - maerke + varetype - for de
     UBRUGTE varer; modellen skriver kun den korte anbefaling ud fra dem. */

  var IND_DOM = {
    let:     { t:'Sælger let',      k:'ind-let' },
    saelger: { t:'Sælger',          k:'ind-ok' },
    lovende: { t:'Lovende',         k:'ind-ok' },
    tidligt: { t:'For tidligt',     k:'ind-tidligt' },
    traeg:   { t:'Træg',            k:'ind-traeg' }
  };

  function hentIndkob(){
    var krop = $('indkob-body');
    visSkelet(krop, 4);
    fetch(FILL_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode:'indkob' })
    }).then(function(r){ return r.json(); }).then(function(r){
      if(!r || r.error) throw new Error((r && r.error) || 'ukendt fejl');
      tegnIndkob(r);
    }).catch(function(e){
      visFejl(krop, 'Analysen kunne ikke hentes', e.message || 'Kunne ikke nå serveren', hentIndkob);
    });
  }

  // Tallene bag en dom, paa én linje. Kun det, der findes, kommer med.
  function indTal(g){
    var d = [];
    d.push(g.solgt + ' solgt af ' + g.vurderbare + ' bedømte' + (g.varer > g.vurderbare ? ' (' + g.varer + ' i alt)' : ''));
    if(g.medianDageTilSalg != null) d.push(String(g.medianDageTilSalg).replace('.', ',') + (g.medianDageTilSalg === 1 ? ' dag' : ' dage') + ' til salg');
    if(g.medianSalgspris != null) d.push(kr(g.medianSalgspris));
    if(g.medianAfNypris != null) d.push(Math.round(g.medianAfNypris) + ' % af nypris');
    if(g.hjerterPrDag) d.push(String(g.hjerterPrDag).replace('.', ',') + ' ♥/dag');
    return d.join(' · ');
  }

  function indDomChip(g){
    var dm = IND_DOM[g.dom] || IND_DOM.tidligt;
    return '<span class="ind-dom ' + dm.k + '">' + esc(dm.t) + '</span>';
  }

  function tegnIndkob(r){
    var krop = $('indkob-body');
    krop.className = 'body';
    krop.removeAttribute('aria-hidden');
    var hel = r.helhed, h = '';

    if(!hel.varer){
      krop.innerHTML = '<div class="empty"><h3>Ingen ubrugte varer at lære af endnu</h3>' +
        '<p>Når du har lagt nye varer op på Vinted — med eller uden prismærke — og nogle af dem er solgt, ' +
        'står det her, hvilke kategorier og produkter der går let.</p></div>';
      return;
    }

    h += '<p class="note">Bygger kun på dine egne annoncer på Vinted. En vare kan bedømmes, når den er solgt ' +
         'eller har været ude i ' + r.regler.stilleDage + ' dage; solgt inden for ' + r.regler.hurtigDage +
         ' dage tæller som let.</p>';

    h += '<div class="sect"><span class="label">Ubrugte varer i alt</span>' +
         '<div class="ind-row"><div class="ind-top"><b>' + hel.varer + ' varer</b>' + indDomChip(hel) + '</div>' +
         '<div class="s">' + esc(indTal(hel)) + '</div>' +
         (r.sammenligning.varer ? '<div class="s">Brugte til sammenligning: ' + esc(indTal(r.sammenligning)) + '</div>' : '') +
         '<div class="s">' + esc(hel.sikkerhed) + '</div></div></div>';

    var a = r.anbefaling;
    if(a && (a.overblik || a.koebIgen.length || a.ladVaere.length)){
      h += '<div class="sect"><span class="label">Anbefaling</span>';
      if(a.overblik) h += '<p class="ind-overblik">' + esc(a.overblik) + '</p>';
      if(a.koebIgen.length) h += '<div class="ind-anb"><b>Køb igen</b>' + a.koebIgen.map(function(x){
        return '<p><span class="ind-navn">' + esc(x.navn) + '</span> — ' + esc(x.hvorfor) + '</p>';
      }).join('') + '</div>';
      if(a.ladVaere.length) h += '<div class="ind-anb"><b>Lad være</b>' + a.ladVaere.map(function(x){
        return '<p><span class="ind-navn">' + esc(x.navn) + '</span> — ' + esc(x.hvorfor) + '</p>';
      }).join('') + '</div>';
      h += '</div>';
    } else if(!hel.vurderbare){
      h += '<p class="note">Ingen af de ubrugte varer kan bedømmes endnu, så der er ingen anbefaling. ' +
           'Tallene nedenfor viser, hvor de står lige nu.</p>';
    }

    h += '<div class="sect"><span class="label">Kategorier</span>' + r.kategorier.map(function(g){
      return '<div class="ind-row"><div class="ind-top"><b>' + esc(g.navn) + '</b>' + indDomChip(g) + '</div>' +
        '<div class="s">' + esc(indTal(g)) + '</div>' +
        '<div class="s">' + esc(g.sikkerhed) + ' · nr. ' + esc(g.nr.join(', ')) + '</div></div>';
    }).join('') + '</div>';

    h += '<div class="sect"><span class="label">Produkter</span>' + r.produkter.map(function(g){
      return '<details class="ind-row"><summary><div class="ind-top"><b>' + esc(g.navn) + '</b>' + indDomChip(g) + '</div>' +
        '<div class="s">' + esc(indTal(g)) + '</div></summary>' +
        g.enkelte.map(function(v){
          var ekstra = [];
          ekstra.push(v.hjerter + ' ♥');
          if(v.nypris) ekstra.push('nypris ' + kr(v.nypris) + (v.andelAfNypris != null ? ' (' + v.andelAfNypris + ' %)' : ''));
          if(v.nedsaettelser) ekstra.push(v.nedsaettelser + (v.nedsaettelser === 1 ? ' nedsættelse' : ' nedsættelser'));
          var tag = v.nr != null ? 'a class="ind-vare" href="#v' + esc(String(v.nr)) + '"' : 'div class="ind-vare"';
          return '<' + tag + '>' +
            '<span class="t">' + (v.nr != null ? 'Nr. ' + esc(String(v.nr)) + ' · ' : '') + esc(v.titel) + '</span>' +
            '<span class="s">' + esc(v.udfald) + ' · ' + esc(ekstra.join(' · ')) + '</span>' +
            '</' + (v.nr != null ? 'a' : 'div') + '>';
        }).join('') + '</details>';
    }).join('') + '</div>';

    krop.innerHTML = h;
  }

  $('m-indkob').addEventListener('click', function(){ show('indkob'); hentIndkob(); });

  /* ---- Konto -------------------------------------------------------------
     Omsaetning og salg, regnet af listings - kun Vinted har en
     raekke dér, saa et salg paa DBA/Reshopper kendes kun som »taget ned«.
     Modelkaldene laeses af forbrug (sql/017 giver appen lov). Intet gemmes. */

  // Kurs til at vise modelforbruget i kroner. Et skoen, derfor »ca.«.
  var USD_KR = 6.9;

  function hentKonto(){
    var krop = $('konto-body');
    visSkelet(krop, 4);
    Promise.all([
      sb.from('listings').select('id, platform, title, status, price, start_price, sold_price, listed_at, sold_at, favourites, drafts(nr, brand, category)'),
      sb.from('forbrug').select('usd, draft_id').limit(20000),
      sb.from('drafts').select('id', { count:'exact', head:true }).not('taget_ned', 'is', null)
    ]).then(function(svar){
      var fejl = svar[0].error || svar[1].error;
      if(fejl) throw new Error(fejl.message);
      tegnKonto(svar[0].data || [], svar[1].data || [], svar[2].count || 0);
    }).catch(function(e){
      visFejl(krop, 'Kontoen kunne ikke hentes', e.message || 'Kunne ikke nå serveren', hentKonto);
    });
  }

  function median(a){
    if(!a.length) return null;
    var s = a.slice().sort(function(x, y){ return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
  }
  function dageMellem(a, b){ return (new Date(b) - new Date(a)) / 86400000; }
  function dageTekst(d){ return d < 0.5 ? 'under en dag' : String(d).replace('.', ',') + (d === 1 ? ' dag' : ' dage'); }
  function tusind(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  // Store beloeb i oversigten: »1.058 kr« - kr() giver »1058,00 kr«, som er
  // reglen for priser, men tallene her er summer.
  function krSum(n){ return tusind(n) + ',00 kr'; }

  function kontoFelt(tal, navn, under){
    return '<div class="konto-felt"><span class="konto-tal">' + esc(tal) + '</span>' +
      '<span class="konto-navn">' + esc(navn) + '</span>' +
      (under ? '<span class="konto-under">' + esc(under) + '</span>' : '') + '</div>';
  }

  function tegnKonto(ann, forbrug, tagetNed){
    var krop = $('konto-body');
    krop.className = 'body';
    krop.removeAttribute('aria-hidden');

    var solgte = ann.filter(function(l){ return l.status === 'solgt'; });
    var aktive = ann.filter(function(l){ return l.status === 'aktiv'; });
    if(!ann.length){
      krop.innerHTML = '<div class="empty"><h3>Ingen annoncer endnu</h3>' +
        '<p>Når dine første varer ligger på Vinted, står omsætningen og salgene her.</p></div>';
      return;
    }
    function salgspris(l){ return Number(l.sold_price != null ? l.sold_price : l.price) || 0; }
    var omsaetning = solgte.reduce(function(s, l){ return s + salgspris(l); }, 0);
    var udenPris = solgte.filter(function(l){ return l.sold_price == null; }).length;
    var nu = new Date(), mdNu = nu.getFullYear() * 12 + nu.getMonth();
    function md(iso){ var d = new Date(iso); return d.getFullYear() * 12 + d.getMonth(); }
    var denneMd = solgte.filter(function(l){ return l.sold_at && md(l.sold_at) === mdNu; });
    var forrigeMd = solgte.filter(function(l){ return l.sold_at && md(l.sold_at) === mdNu - 1; });
    function sum(a){ return a.reduce(function(s, l){ return s + salgspris(l); }, 0); }

    var dage = solgte.filter(function(l){ return l.listed_at && l.sold_at; })
      .map(function(l){ return Math.max(0, dageMellem(l.listed_at, l.sold_at)); });
    var medDage = median(dage);
    var udbud = solgte.filter(function(l){ return l.sold_price != null && Number(l.start_price) > 0; });
    var andel = udbud.length ? udbud.reduce(function(s, l){ return s + Number(l.sold_price); }, 0) /
                               udbud.reduce(function(s, l){ return s + Number(l.start_price); }, 0) * 100 : null;
    var udeVaerdi = aktive.reduce(function(s, l){ return s + (Number(l.price) || 0); }, 0);
    var hjerter = aktive.reduce(function(s, l){ return s + (Number(l.favourites) || 0); }, 0);

    var h = '';

    // Det store tal foerst - det er det, man kommer for.
    var sammen = '';
    if(forrigeMd.length || denneMd.length){
      sammen = 'denne måned ' + krSum(sum(denneMd)) + ' · sidste måned ' + krSum(sum(forrigeMd));
    }
    h += '<div class="konto-top"><span class="label">Omsætning i alt</span>' +
      '<div class="konto-stor">' + esc(krSum(omsaetning)) + '</div>' +
      '<div class="konto-under">' + esc(solgte.length + (solgte.length === 1 ? ' vare solgt' : ' varer solgt') +
        (sammen ? ' · ' + sammen : '')) + '</div></div>';

    h += '<div class="konto-gitter">' +
      kontoFelt(solgte.length ? krSum(omsaetning / solgte.length) : '–', 'Gns. salgspris') +
      kontoFelt(medDage != null ? dageTekst(Math.round(medDage * 10) / 10) : '–', 'Tid til salg', 'median') +
      kontoFelt(String(aktive.length), 'Ude nu', 'til ' + krSum(udeVaerdi)) +
      kontoFelt(andel != null ? Math.round(andel) + ' %' : '–', 'Af udbudsprisen', 'det, køberne betalte') +
      '</div>';

    // Omsaetning pr. maaned, de seneste seks. Soejlerne er relative til den
    // stoerste maaned; tallet staar over, saa intet skal aflaeses af hoejden.
    var mdr = [];
    for(var i = 5; i >= 0; i--){
      var m = mdNu - i, liste = solgte.filter(function(l){ return l.sold_at && md(l.sold_at) === m; });
      mdr.push({ navn: new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('da-DK', { month:'short' }).replace('.', ''),
                 kr: sum(liste), n: liste.length, nu: i === 0 });
    }
    var maks = Math.max.apply(null, mdr.map(function(x){ return x.kr; })) || 1;
    h += '<div class="sect"><span class="label">Pr. måned</span><div class="konto-graf" role="img" aria-label="' +
      esc(mdr.map(function(x){ return x.navn + ' ' + Math.round(x.kr) + ' kr'; }).join(', ')) + '">' +
      mdr.map(function(x){
        return '<div class="konto-md' + (x.nu ? ' nu' : '') + '">' +
          '<span class="konto-md-tal">' + (x.kr ? esc(tusind(x.kr)) : '') + '</span>' +
          '<span class="konto-soejle" style="height:' + Math.max(x.kr ? 4 : 1, Math.round(x.kr / maks * 110)) + 'px"></span>' +
          '<span class="konto-md-navn">' + esc(x.navn) + '</span>' +
          '<span class="konto-md-n">' + (x.n ? x.n + ' stk' : '') + '</span></div>';
      }).join('') + '</div><p class="note">Beløb i kroner, solgt på Vinted.</p></div>';

    // Hvad det har kostet. Kun modelkaldene kendes - indkoebsprisen gemmes ikke.
    var usd = forbrug.reduce(function(s, f){ return s + (Number(f.usd) || 0); }, 0);
    var varer = {};
    forbrug.forEach(function(f){ if(f.draft_id) varer[f.draft_id] = 1; });
    var nVarer = Object.keys(varer).length, udgift = usd * USD_KR;
    h += '<div class="sect"><span class="label">Udgifter</span>' +
      '<div class="konto-linje"><span>Analyse og tekster (AI)</span><b>ca. ' + esc(krSum(udgift)) + '</b></div>' +
      (nVarer ? '<div class="konto-linje s"><span>Pr. vare analyseret (' + nVarer + ')</span><span>ca. ' + esc(kr(udgift / nVarer)) + '</span></div>' : '') +
      '<div class="konto-linje sum"><span>Tilbage efter AI</span><b>' + esc(krSum(omsaetning - udgift)) + '</b></div>' +
      '<p class="note">' + esc(usd.toFixed(2).replace('.', ',') + ' $ regnet om til ca. ' + String(USD_KR).replace('.', ',') +
        ' kr pr. dollar. Indkøbsprisen kender appen ikke, så den er ikke trukket fra.') + '</p></div>';

    // Det, der ligger ude: hjerterne viser, hvad der er tæt paa et salg.
    if(aktive.length){
      var top = aktive.filter(function(l){ return l.favourites; })
        .sort(function(a, b){ return b.favourites - a.favourites; }).slice(0, 3);
      h += '<div class="sect"><span class="label">Ude nu</span>' +
        '<div class="konto-linje"><span>Annoncer på Vinted</span><b>' + aktive.length + '</b></div>' +
        '<div class="konto-linje"><span>Samlet udbudspris</span><b>' + esc(krSum(udeVaerdi)) + '</b></div>' +
        '<div class="konto-linje"><span>Hjerter i alt</span><b>' + hjerter + ' ♥</b></div>' +
        (top.length ? '<p class="note note-luft">Flest hjerter</p>' + top.map(kontoVare(function(l){
          return l.favourites + ' ♥ · ' + kr(l.price) + ' · ude ' + dageTekst(Math.round(dageMellem(l.listed_at || nu, nu)));
        })).join('') : '') + '</div>';
    }

    if(solgte.length){
      var seneste = solgte.slice().sort(function(a, b){ return new Date(b.sold_at || 0) - new Date(a.sold_at || 0); });
      h += '<div class="sect"><span class="label">Salg</span>' + seneste.map(kontoVare(function(l){
        var d = l.listed_at && l.sold_at ? Math.round(dageMellem(l.listed_at, l.sold_at)) : null;
        var bud = l.sold_price != null && Number(l.start_price) > Number(l.sold_price) ? ' (udbudt ' + kr(l.start_price) + ')' : '';
        return (l.sold_price != null ? kr(l.sold_price) : 'salgspris mangler') + bud +
          (l.sold_at ? ' · ' + new Date(l.sold_at).toLocaleDateString('da-DK', { day:'numeric', month:'short' }) : '') +
          (d != null ? ' · lå ' + dageTekst(d) : '');
      })).join('') + '</div>';
    }

    var noter = [];
    if(udenPris) noter.push(udenPris + ' salg mangler salgsprisen og tæller med udbudsprisen.');
    if(tagetNed) noter.push(tagetNed + (tagetNed === 1 ? ' vare er' : ' varer er') + ' taget ned på DBA/Reshopper; salg dér kender appen ikke beløbet på.');
    noter.push('DBA og Reshopper er ikke med i tallene — kun Vinted har annoncer, appen kan følge.');
    h += '<p class="note note-luft">' + esc(noter.join(' ')) + '</p>';

    krop.innerHTML = h;
  }

  // En raekke pr. vare, der aabner varen, naar den har et loebenummer.
  function kontoVare(linje){
    return function(l){
      var nr = l.drafts && l.drafts.nr;
      var tag = nr != null ? 'a class="ind-vare" href="#v' + esc(String(nr)) + '"' : 'div class="ind-vare"';
      return '<' + tag + '><span class="t">' + (nr != null ? 'Nr. ' + esc(String(nr)) + ' · ' : '') + esc(l.title || '') + '</span>' +
        '<span class="s">' + esc(linje(l)) + '</span></' + (nr != null ? 'a' : 'div') + '>';
    };
  }




  // Hele lageret hentes med annoncerne paa: fasen, prisen og hjerterne paa
  // kortet kommer fra annoncen, ikke fra udkastet.
  var ANNONCE_FELTER = 'id, platform, url, external_id, title, price, start_price, status, favourites, ' +
    'listed_at, sold_at, sold_price, pending, pending_note, pending_since, forslag, last_check_at, next_check_at, auto, note, published, synced_at, fotos';
  // Koeberbeskeder fra Vinteds mails, der venter paa dit svar.
  var SVAR = [], KOE_HENTET = false;
  function hentSvar(){
    sb.from('koeber_beskeder')
      .select('id, at, item_title, buyer_message, reply, intent, counter_price, samtale')
      .eq('kilde', 'mail').is('besvaret_at', null).order('at', { ascending:true })
      .then(function(res){
        if(res.error) return;
        SVAR = res.data || [];
        if(KOE_HENTET) renderQueue();   // ellers tegnes forsiden tom, foer lageret er hentet
      });
  }
  function hentKoe(stille){
    hentSvar();
    if(!stille){
      visSkelet($('queue-loading'), 3);
      $('queue-empty').hidden = true;
    }
    sb.from('drafts').select('*, listings(' + ANNONCE_FELTER + ')')
      .in('status', ['ny','afventer','kladde','afsendt'])
      .order('created_at', { ascending:false })
      .then(function(res){
        if(res.error){
          visFejl($('queue-loading'), 'Køen kunne ikke hentes',
            res.error.message || 'Forbindelsen svarede ikke.', hentKoe);
          return;
        }
        (res.data || []).forEach(function(d){ rows[d.id] = d; });
        KOE_HENTET = true;
        renderQueue();
        opdaterVagtTal();
      });
  }
  // Annoncerne skifter tit flere ad gangen (et tilsyn, et salg). Én
  // genhentning bagefter er nok.
  var genhentTimer = null;
  function genhentSnart(){
    clearTimeout(genhentTimer);
    genhentTimer = setTimeout(function(){ hentKoe(true); }, 400);
  }

  /* ---- Login og opstart -------------------------------------------------- */
  $('login-form').addEventListener('submit', function(e){
    e.preventDefault();
    var btn = $('login-btn');
    $('login-err').textContent = '';
    btn.disabled = true; btn.textContent = 'Logger ind …';
    sb.auth.signInWithPassword({ email: LOGIN_EMAIL, password: $('pw').value }).then(function(res){
      btn.disabled = false; btn.textContent = 'Log ind';
      if(res.error){ $('login-err').textContent = 'Forkert adgangskode.'; return; }
      enter();
    });
  });

  function enter(){
    stack = [];
    show('queue', { fade: true });
    if(started) return;
    started = true;

    hentKoe();
    opdaterVagtTal();
    tegnTjek();   // tallet paa Mere-fanen, hvis noget i opsaetningen er gaaet i staa
    aabnFraAdresse();

    sb.channel('drafts-live').on('postgres_changes',
      { event:'*', schema:'public', table:'drafts' }, function(p){
        if(p.eventType === 'DELETE') delete rows[p.old.id];
        else {
          // Realtidskanalen sender kun raekken selv — annoncerne bliver hængende.
          p.new.listings = (rows[p.new.id] && rows[p.new.id].listings) || [];
          rows[p.new.id] = p.new;
        }
        renderQueue();
      }).on('postgres_changes',
      { event:'*', schema:'public', table:'listings' }, genhentSnart).subscribe();
  }

  /* ---- Ny udgave --------------------------------------------------------
     GitHub Pages cacher siden i ti minutter, og en app på hjemmeskærmen
     genoptager den side, den havde i forvejen — den henter ikke noget nyt,
     før iOS river webview'et ned. Uden det her ville en rettelse kunne blive
     ved med at være usynlig, uden at det var til at gennemskue hvorfor.

     Vi spørger derfor selv serveren, om filen har ændret sig, og siger til i
     stedet for at genindlæse af os selv: en genindlæsning midt i en
     billedserie ville koste det hele. */
  var lastCheck = 0, updateShown = false;

  // Den koerende sides EGET stempel: app.js?v=XXXX i dens eget script-tag.
  // Foer sammenlignede vi index.htmls ETag over tid, og det svigtede naar iOS
  // aabnede appen frisk med gammel kode: den satte bare den nye ETag som
  // udgangspunkt og opdagede aldrig, at koden var forael. Nu spoerger vi:
  // matcher det, jeg KOERER, det serveren har lige nu?
  function minBuild(){
    var sc = document.querySelector('script[src*="app.js?v="]');
    var m = sc && sc.getAttribute('src').match(/app\.js\?v=([0-9a-f]+)/);
    return m ? m[1] : null;
  }

  function checkForUpdate(){
    var now = Date.now();
    if(updateShown || now - lastCheck < 30000) return;
    lastCheck = now;
    var mit = minBuild();
    if(!mit) return;                 // kan ikke afgoere -> ti hellere
    // Cache-bust, saa vi ser serverens sandhed og ikke webview'ets kopi.
    fetch(location.pathname + '?_=' + now, { cache: 'no-store' })
      .then(function(r){ return r.text(); })
      .then(function(html){
        var m = html.match(/app\.js\?v=([0-9a-f]+)/);
        if(!m || m[1] === mit) return;   // ingen nyt, eller samme udgave
        var nyt = m[1];
        updateShown = true;
        var t = document.createElement('div');
        t.className = 'toast toast-action';
        var label = document.createElement('span');
        label.textContent = 'Der er kommet en ny udgave';
        var go = document.createElement('button');
        go.type = 'button'; go.textContent = 'Opdatér';
        // Naviger til en cache-bustet adresse: saa henter iOS en frisk
        // index.html, der peger paa den nye app.js?v=, i stedet for at
        // genindlaese sin egen gemte kopi.
        go.addEventListener('click', function(){
          location.replace(location.pathname + '?u=' + nyt);
        });
        t.appendChild(label); t.appendChild(go);
        document.body.appendChild(t);
        setTimeout(function(){ t.remove(); updateShown = false; }, 10000);
      }).catch(function(){});
  }

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(function(){
      if(typeof notifTilstand === 'function') notifTilstand();
    }).catch(function(){});
  }

  checkForUpdate();
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible') checkForUpdate();
  });

  sb.auth.getSession().then(function(res){
    if(res.data.session) enter();
    else { stack = []; show('login', { fade:true }); }
  });
})();
