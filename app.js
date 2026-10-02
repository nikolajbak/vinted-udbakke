(function(){
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
    return isFinite(n) ? n + ' kr' : (v || '');
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
  function undoToast(id, previous){
    var t = document.createElement('div');
    t.className = 'toast toast-action';
    var label = document.createElement('span');
    label.textContent = 'Udkastet er kasseret';
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

  function renderQueue(){
    var list = Object.keys(rows).map(function(k){ return rows[k]; })
      .filter(function(d){ return ['ny','afventer','kladde'].indexOf(d.status) > -1; })
      .sort(function(a,b){ return a.created_at < b.created_at ? 1 : -1; });

    $('queue-loading').hidden = true;
    $('queue-empty').hidden = list.length > 0;

    var el = $('queue-list');
    el.innerHTML = list.map(function(d){
      var linje3 = d.status === 'ny'
        ? '<span class="kort-pris">' + esc(kortPris(d.price)) + '</span>' + markedsMaerker(d)
        : esc(koeStatus(d));
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

    Array.prototype.forEach.call(el.querySelectorAll('.swipe'), wireSwipe);

    if(currentId && rows[currentId] && !screenEl('detail').hidden) renderDetail();
  }

  /* ---- Detalje ---------------------------------------------------------- */
  function openDetail(id){ currentId = id; renderDetail(); show('detail'); hentAnnoncer(id); }

  // Prisvagten kender annoncens adresse ude paa markedspladsen. Er den lagt op
  // med automatikken, kan man derfor gaa fra udkastet til den rigtige annonce
  // — og se hvad den koster NU, som kan vaere noget andet end det, udkastet
  // siger.
  function renderDetail(){
    var d = rows[currentId];
    if(!d) return;
    $('d-title').textContent = d.title || 'Udkast';
    $('d-nr').textContent = fmtNr(d.nr);
    var photos = d.photos || [];
    var failed = (d.price_note || '').indexOf('Analyse mislykkedes') === 0;

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
      html += '<div class="strip" id="d-strip">' + photos.map(function(p, i){
        return '<img src="' + esc(p.url) + '" data-i="' + i + '" alt="' + esc(p.kind || '') + '">';
      }).join('') + '</div>';
      html += '<div class="note">Swip i billedet for at bladre. Tryk på et lille billede for at beskære det.</div>';
    }

    if(d.status === 'ny' || d.status === 'afsendt'){
      html += '<div class="price-row" id="d-pris"><span class="price-big mono">' + esc(d.price || '?') + '</span>' +
              (d.price_grounded === false ? '<span class="chip chip-vent">Foreløbig</span>' : '') + '</div>';
      if(d.price_grounded === false){
        html += '<div class="note">Prisen markedstjekkes mod rigtige annoncer, når du udfylder på markedspladsen.</div>';
      }
      if(d.price_note) html += '<div class="note">' + esc(d.price_note) + '</div>';
      var facts = [d.brand, d.size, d.category, d.condition].filter(Boolean);
      if(facts.length) html += '<div class="note">' + esc(facts.join(' · ')) + '</div>';
      if(d.description) html += '<div class="desc">' + esc(d.description) + '</div>';
    } else if(failed){
      html += '<div class="warn">' + esc(d.price_note) + '</div>';
    } else {
      html += '<div class="note note-luft">Claude analyserer billederne og skriver udkastet. Det tager typisk under et minut.</div>';
    }

    if(d.personal_info){
      html += '<div class="warn">Der blev fundet personlige oplysninger på et af billederne — fx et påsyet navnemærke — og de er automatisk maskeret. Tjek billederne, før du uploader.</div>';
    }
    html += '<div class="note note-luft">' + esc(relTime(d.created_at)) + '</div>';
    $('d-body').innerHTML = html;

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
        var i = e.target.getAttribute && e.target.getAttribute('data-i');
        if(i !== null && i !== undefined) openCrop(d, Number(i));
      });
    }

    // Kun de to handlinger, du bruger hver gang, er fastgjort nederst. Resten
    // ligger i indholdet — så fylder bundlinjen ikke en tredjedel af skærmen,
    // og "Kasser" ligger ikke lige ved siden af det, du trykker på dagligt.
    var rest = '<div class="sect">';
    // En afsendt annonce aabnes for at blive laest — og for at komme videre til
    // den rigtige annonce ude paa markedspladsen. Den plads staar tom, til
    // opslaget svarer; ellers ville knapperne hoppe paa plads bagefter.
    if(d.status === 'ny' || d.status === 'afsendt'){
      rest += '<div id="d-udgivet"></div>' +
              '<button type="button" class="btn btn-secondary" data-a="edit">Redigér annonce</button>';
    }
    if(d.status === 'afsendt'){
      rest += '<button type="button" class="btn btn-quiet" data-a="save">Gem billeder i Fotos</button>' +
              '<button type="button" class="btn btn-quiet" data-a="copy">Kopiér tekst</button>' +
              '<button type="button" class="btn btn-secondary" data-a="requeue">Flyt tilbage til køen</button>';
    }
    if(d.status === 'ny'){
      // "Gem billeder i Fotos" er en hjaelpehandling og hoerer til her, ikke
      // paa linje med de tre markedspladser. Den fyldte en fjerdedel af foden
      // og trak opmaerksomhed fra det, skaermen handler om.
      rest += '<button type="button" class="btn btn-quiet" data-a="save">Gem billeder i Fotos</button>' +
              '<button type="button" class="btn btn-quiet" data-a="copy">Kopiér tekst</button>' +
              '<button type="button" class="btn btn-quiet" data-a="posted">Markér som postet</button>';
    }
    // Hvad er varen markeret som sendt til — og vejen ud af en fejlmarkering.
    var maerker = MARKEDER.filter(function(m){ return sendtTil(d)[m.k]; });
    if(maerker.length && d.status !== 'kladde'){
      rest += '<span class="label">Markeret som sendt til</span>' +
        '<div class="maerke-rad">' + maerker.map(function(m){
          return '<button type="button" class="maerke" data-a="fjern-' + m.k + '" ' +
            'aria-label="Fjern markeringen for ' + esc(m.navn) + '">' + esc(m.navn) +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
            '</button>';
        }).join('') + '</div>';
    }
    rest += '<button type="button" class="btn btn-danger" data-a="discard">' +
            (d.status === 'afsendt' ? 'Fjern fra listen' : 'Kasser udkast') + '</button></div>';
    $('d-body').insertAdjacentHTML('beforeend', rest);

    var f = '';
    if(d.status === 'ny'){
      // Tre markedspladser paa EN linje frem for fire stablede knapper. Stablet
      // aad foden 200 af 704 px og klemte indholdet ned under to tredjedele af
      // skaermen — og navnet alene er nok, naar overskriften allerede siger
      // hvilken vare det er.
      var sendt = sendtTil(d);
      f += '<div class="market-row">' + MARKEDER.map(function(m){
        var ok = !!sendt[m.k];
        return '<button type="button" class="btn btn-market' + (ok ? ' is-done' : '') +
          '" data-a="' + m.a + '">' + esc(m.navn) + '</button>';
      }).join('') + '</div>';
    } else if(failed){
      f += '<button type="button" class="btn btn-primary" data-a="retry">Prøv analysen igen</button>';
    }
    $('d-footer').innerHTML = f;
    $('d-footer').hidden = !f;

    Array.prototype.forEach.call(
      document.querySelectorAll('#d-footer [data-a], #d-body [data-a]'), function(b){
        b.addEventListener('click', function(){ detailAction(b.getAttribute('data-a'), d, b); });
      });
  }

  function hentAnnoncer(id){
    sb.from('listings').select('platform, url, external_id, price, status, published, ' +
                               'synced_at, pending, pending_note')
      .eq('draft_id', id).then(function(res){
        if(currentId !== id) return;
        var el = $('d-udgivet');
        if(!el) return;
        var d = rows[id];
        var l = (res.data || []).filter(function(x){ return x.url || x.published; });
        var harVinted = l.filter(function(x){ return x.platform === 'vinted'; }).length;
        var h = l.map(function(x){ return udgivetBlok(x, d); }).join('');
        // Er varen lagt op UDEN appens udfyldning, findes annoncen ikke i
        // basen — og saa er der ingenting at synkronisere tilbage fra.
        // Feltet her er vejen ind: annoncens adresse. Det staar kun, hvor der
        // er grund til at tro, at annoncen FINDES — er udkastet stadig i koen
        // og aldrig sendt nogen steder hen, er der intet at knytte til.
        if(!harVinted && d && (d.status === 'afsendt' || sendtTil(d).vinted)) h += knytBlok();
        if(!h) return;
        el.innerHTML = h;
        if(l.length) visUdgivetPris(l, d);
        Array.prototype.forEach.call(el.querySelectorAll('[data-aabn]'), function(b){
          b.addEventListener('click', function(){ aabnUdad(b.getAttribute('data-aabn')); });
        });
        var felt = el.querySelector('[data-knyt="felt"]');
        var gem = el.querySelector('[data-knyt="gem"]');
        if(felt && gem) gem.addEventListener('click', function(){ tilknytAnnonce(d, felt); });
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
    var h = '<div class="udgivet"><span class="label">Udgivet på ' + esc(navn) + '</span>';

    // Ventende rettelser staar oeverst: det er det eneste her, der kraever
    // noget af dig. Resten er til orientering.
    var venter = venterFelter(x);
    if(venter.length && x.external_id && x.platform === 'vinted'){
      h += '<div class="vagt-forslag"><b>Venter på at komme ud: ' + esc(venter.join(', ')) + '</b>' +
        (x.pending_note ? '<span>' + esc(x.pending_note) + '</span>' : '') +
        '<button type="button" class="btn btn-primary" data-aabn="' +
        esc('https://www.vinted.dk/items/' + x.external_id + '/edit') +
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
        raekker += udgivetRaekke('Pris', p.price + ' kr',
          (isFinite(udkast) && udkast !== p.price) ? 'udkast: ' + udkast + ' kr' : '');
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

    if(x.external_id && x.platform === 'vinted'){
      h += '<button type="button" class="btn btn-quiet" data-aabn="' +
           esc('https://www.vinted.dk/items/' + x.external_id + '?udbakke=synk') +
           '">Opdatér fra ' + esc(navn) + '</button>';
    }
    if(x.url){
      h += '<button type="button" class="btn btn-secondary" data-aabn="' + esc(x.url) + '">' +
           'Åbn på ' + esc(navn) +
           (x.status === 'solgt' ? ' · solgt' : (x.price ? ' · ' + x.price + ' kr' : '')) +
           '</button>';
    }
    return h + '</div>';
  }

  function udgivetRaekke(navn, vaerdi, hale){
    return '<div class="ud-rk"><span class="ud-k">' + esc(navn) + '</span>' +
           '<span class="ud-v">' + esc(vaerdi) + '</span>' +
           (hale ? '<span class="ud-h">' + esc(hale) + '</span>' : '') + '</div>';
  }

  // Det store tal skal vaere annoncens pris, ikke udkastets. Staar der 175 i
  // appen og 149 paa Vinted, er det 149, varen koster.
  function visUdgivetPris(l, d){
    var el = $('d-pris');
    if(!el) return;
    var levende = l.filter(function(x){ return x.published && x.published.price; })[0];
    if(!levende) return;
    var pris = levende.published.price;
    var udkast = prisTal(d && d.price);
    el.innerHTML = '<span class="price-big mono">' + esc(pris + ' kr') + '</span>' +
      '<span class="chip chip-ny">' + esc(markedsNavn(levende.platform)) + '</span>' +
      (isFinite(udkast) && udkast !== pris
        ? '<span class="pris-foer">udbudt til ' + esc(udkast + ' kr') + '</span>' : '');
  }

  // Kom du tilbage fra Vinted, er der sandsynligvis noget nyt at hente. Uden
  // det her ville skaermen staa med gamle tal, til man selv gik ud og ind
  // igen — og saa ligner synkroniseringen noget, der ikke virker.
  document.addEventListener('visibilitychange', function(){
    if(document.hidden || !currentId) return;
    if(screenEl('detail').hidden) return;
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
    btn.disabled = true; btn.textContent = 'Åbner …';
    markerSendt(d, key);
    aabnUdad(url, sb.from('drafts')
      .update({ selected_at: new Date().toISOString() }).eq('id', d.id));
    setTimeout(function(){ btn.disabled = false; btn.textContent = navn; }, 2500);
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
      var text = [d.title, d.description, d.price ? 'Pris: ' + d.price : ''].filter(Boolean).join('\n\n');
      if(navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ toast('Teksten er kopieret'); });
    }
    else if(a === 'save') savePhotos(d, btn);
    else if(a === 'posted'){
      sb.from('drafts').update({ status: 'afsendt', posted_at: new Date().toISOString() }).eq('id', d.id);
      back(); toast('Flyttet til afsendte annoncer');
    }
    else if(a === 'requeue'){
      // Varen stod som afsendt ved en fejl. Maerkerne bliver staaende — hvilke
      // markedspladser den FAKTISK er sendt til, er et andet spoergsmaal end
      // om den er faerdig, og dem kan du rette hver for sig herunder.
      btn.disabled = true;
      d.status = 'ny'; d.posted_at = null;
      sb.from('drafts').update({ status: 'ny', posted_at: null }).eq('id', d.id)
        .then(function(){
          rows[d.id] = d;
          renderQueue(); hentHistorik();
          back(); toast('Flyttet tilbage til køen');
        });
    }
    else if(a.indexOf('fjern-') === 0){
      fjernMaerke(d, a.slice(6));
      toast('Markeringen er fjernet');
    }
    else if(a === 'discard'){
      var vAfsendt = d.status === 'afsendt';
      sb.from('drafts').update({ status: 'kasseret' }).eq('id', d.id);
      delete rows[d.id];
      back(); toast(vAfsendt ? 'Fjernet fra listen' : 'Udkastet er kasseret');
      if(vAfsendt) hentHistorik();
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
      ['Pris', r.priceInKroner ? r.priceInKroner + ' kr' : '']
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
    $('cap-finish').hidden = session.photos.length === 0;
    $('cap-progress').innerHTML = STEPS.map(function(_, n){
      return '<i class="' + (n < i ? 'done' : n === i ? 'now' : '') + '"></i>';
    }).join('');
    $('cap-shots').innerHTML = session.photos.map(function(p){
      return '<div class="shot"><img src="' + esc(p.url) + '" alt=""><span>' + esc(p.kind) + '</span></div>';
    }).join('');
  }

  function startSession(){ session = { id:null, step:0, photos:[] }; renderCapture(); show('capture'); }
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
    if(!session) return;
    var step = STEPS[session.step];
    var kind = step ? step.kind : 'ekstra';
    var st = $('cap-status');
    st.hidden = false; st.textContent = 'Uploader …';
    $('cap-shoot').disabled = true;

    shrink(file, 1800, 0.9).then(function(blob){
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
    $('cap-shoot').textContent = 'Vælg billede';
  }
  $('cap-shoot').addEventListener('click', function(){ $('cam').click(); });
  $('cap-skip').addEventListener('click', function(){
    if(session && session.step < STEPS.length){ session.step++; renderCapture(); }
  });
  $('cam').addEventListener('change', function(){
    var f = $('cam').files && $('cam').files[0];
    $('cam').value = '';
    if(f) handleShot(f);
  });
  $('cap-finish').addEventListener('click', function(){
    if(!session || !session.id) return;
    var b = $('cap-finish');
    b.disabled = true; b.textContent = 'Sender …';
    sb.from('drafts').update({ status: 'afventer' }).eq('id', session.id).then(function(){
      b.disabled = false; b.textContent = 'Færdig — lav udkast';
      session = null; back(); toast('Udkastet skrives nu');
    });
  });
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

  /* ---- Menu og historik ------------------------------------------------- */
  $('menu-btn').addEventListener('click', function(){ show('menu'); });
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
  function listePris(d){
    var l = (d.listings || []).filter(function(x){ return x.platform === 'vinted'; })[0];
    if(!l) return d.price || '';
    return (l.price ? l.price + ' kr' : (d.price || '')) + (l.status === 'solgt' ? ' · solgt' : '');
  }
  function hentHistorik(){
    var krop = $('hist-body');
    krop.innerHTML = '<div class="skel" id="hist-skel"></div>';
    visSkelet($('hist-skel'), 3);
    // Annoncen hentes med: listen skal vise den pris, varen staar til ude paa
    // markedspladsen, og om den er solgt — ikke det, udkastet engang sagde.
    sb.from('drafts').select('*, listings(platform, price, status)').eq('status','afsendt')
      .order('posted_at',{ascending:false}).limit(30)
      .then(function(res){
        if(res.error){
          krop.innerHTML = '<div class="empty" id="hist-fejl"></div>';
          visFejl($('hist-fejl'), 'Historikken kunne ikke hentes',
            res.error.message || 'Forbindelsen svarede ikke.', hentHistorik);
          return;
        }
        var data = res.data || [];
        // De afsendte laegges i samme kartotek som koeen. Uden det kan
        // detaljeskaermen ikke finde dem — den slaar op paa id, ikke paa
        // hvilken liste man kom fra.
        data.forEach(function(d){ rows[d.id] = d; });
        krop.innerHTML = data.length ? data.map(function(d){
          return '<button type="button" class="hist-row" data-id="' + esc(d.id) + '">' +
            (d.image_url ? '<img src="' + esc(d.image_url) + '" alt="">' : '<span class="ph"></span>') +
            '<span class="row-main">' + kortLinjer(d,
              '<span class="kort-pris">' + esc(listePris(d)) + '</span> · ' + esc(relTime(d.posted_at)) +
              markedsMaerker(d)) + '</span>' +
            '<span class="chev"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span></button>';
        }).join('') : '<div class="empty"><p>Ingen postede annoncer endnu.</p></div>';
        Array.prototype.forEach.call(krop.querySelectorAll('.hist-row'), function(r){
          r.addEventListener('click', function(){ openDetail(r.getAttribute('data-id')); });
        });
      });
  }
  /* ---- Redigering, og vejen ud til markedspladsen -------------------------
     Synkroniseringen gaar begge veje. Den ene vej er at LAESE annoncen; den
     her er at skrive. Men serveren kan ikke skrive i Vinteds formular — det
     kan kun din egen session. Saa en rettelse her bliver til en besked, der
     ligger og venter paa annoncen, indtil den er skrevet ind.

     Kun titel, pris og beskrivelse: det er dem, Vinteds redigeringsformular
     har som almindelige tekstfelter. Kategori, maerke og stoerrelse er
     vaelgere, og de hoerer til, naar annoncen oprettes. */

  var REDIGERES = null;
  // Den Vinted-annonce, rettelsen skal ud i — og det, der står i den lige nu.
  var REDIGERES_ANNONCE = null;

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
          if($('e-price').value === String(prisTal(d.price) || '') && nu.price)
            $('e-price').value = String(nu.price);
          $('e-save').textContent = 'Gem og send til Vinted';
        }
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
    var udkastAendret = !ensLyd(nyTitel, d.title) || !ensLyd(nyTekst, d.description) ||
      (isFinite(nyPrisTal) && nyPrisTal > 0 && nyPrisTal !== prisTal(d.price));
    if(!Object.keys(aendret).length && !udkastAendret){
      back(); toast('Der var ikke noget at ændre'); return;
    }

    var tekst = knap.textContent;
    knap.disabled = true; knap.textContent = 'Gemmer …';
    var opd = { title: nyTitel, description: nyTekst };
    if(isFinite(nyPrisTal) && nyPrisTal > 0) opd.price = String(nyPrisTal);

    var gemt = sb.from('drafts').update(opd).eq('id', d.id).then(function(res){
      if(res.error) throw new Error(res.error.message);
      d.title = opd.title; d.description = opd.description;
      if(opd.price) d.price = opd.price;
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
      aabnUdad('https://www.vinted.dk/items/' + annonce.external_id + '/edit',
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
  $('m-scan').addEventListener('click', function(){
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
  var FELT_NAVNE = { price:'pris', title:'titel', description:'beskrivelse' };
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
    if(d <= 0) return 'tjekkes ved næste besøg på Vinted';
    return 'tjekkes igen om ' + d + (d === 1 ? ' dag' : ' dage');
  }
  function prisKaede(l){
    var e = (VAGT_EVENTS[l.id] || []).filter(function(x){ return x.kind === 'aendret'; });
    if(!e.length) return l.start_price + ' kr';
    var k = [e[0].from_price];
    e.forEach(function(x){ k.push(x.price); });
    return k.join(' → ') + ' kr';
  }

  function vagtRaekke(l){
    var dage = dageSiden(l.listed_at);
    var h = '<div class="vagt-row" data-l="' + esc(l.id) + '">';
    h += '<div class="vagt-top"><span class="t">' + esc(l.title || 'Uden titel') + '</span>' +
         '<span class="pris">' + esc(String(l.price)) + ' kr</span></div>';
    h += '<div class="s">' + esc(l.platform) + ' · ' + dage + (dage === 1 ? ' dag' : ' dage') +
         ' · ' + (l.favourites || 0) + ' hjerter · ' + esc(prisKaede(l)) + '</div>';

    var venter = venterFelter(l);
    if(venter.length){
      var prisVenter = l.pending && l.pending.price;
      h += '<div class="vagt-forslag"><b>' +
           (prisVenter ? 'Ny pris: ' + esc(String(l.pending.price)) + ' kr'
                       : 'Rettelser klar: ' + esc(venter.join(', '))) + '</b>' +
           (prisVenter && venter.length > 1
             ? '<span>Også: ' + esc(venter.filter(function(n){ return n !== 'pris'; }).join(', ')) + '</span>' : '') +
           (l.pending_note ? '<span>' + esc(l.pending_note) + '</span>' : '') +
           '<button type="button" class="btn btn-primary" data-v="saet">' +
           (prisVenter ? 'Sæt prisen på Vinted' : 'Send rettelserne til Vinted') + '</button></div>';
    } else if(l.status === 'aktiv' && !l.auto){
      h += '<div class="vagt-stop">Prisvagten er holdt op med at sætte ned' +
           (l.note ? ': ' + esc(l.note) : '.') + '</div>';
    } else if(l.status === 'aktiv'){
      h += '<div class="s dim">' + esc(omDage(l.next_check_at)) + '</div>';
    }

    if(l.status === 'aktiv' || l.status === 'pause'){
      h += '<details class="vagt-mere"><summary>Svar en køber</summary>' +
           '<textarea class="vagt-besked" rows="3" placeholder="Indsæt købers besked"></textarea>' +
           '<label class="vagt-bund">Bud, hvis der er et' +
           '<input type="number" inputmode="numeric" min="1" class="vagt-bud" placeholder="kr"></label>' +
           '<div class="vagt-knapper"><button type="button" class="btn btn-quiet" data-v="svar">Skriv et svar</button></div>' +
           '<div class="vagt-svar" hidden></div>' +
           '<p class="note">Svaret sendes ikke — du kopierer det selv over i Vinted. ' +
           'Hvad køberne spørger om, bruges, når der læres af salgene.</p></details>';
    }

    h += '<details class="vagt-mere"><summary>Indstillinger</summary>' +
         '<label class="vagt-bund">Mindstepris' +
         '<input type="number" inputmode="numeric" min="15" step="5" value="' +
         esc(String(l.floor_price == null ? '' : l.floor_price)) + '" ' +
         'placeholder="' + esc(String(Math.max(15, Math.round(l.start_price * 0.4)))) + '" data-v="bund"></label>' +
         '<p class="note">Prisvagten går aldrig under den. Står feltet tomt, bruges 40 % af udbudsprisen.</p>' +
         '<div class="vagt-knapper">' +
         '<button type="button" class="btn btn-quiet" data-v="pause">' +
           (l.status === 'pause' ? 'Genoptag' : 'Sæt på pause') + '</button>' +
         '<button type="button" class="btn btn-quiet" data-v="solgt">Markér som solgt</button>' +
         '</div></details></div>';
    return h;
  }

  function hentVagt(){
    var krop = $('vagt-body');
    krop.innerHTML = '<div class="skel" id="vagt-skel"></div>';
    visSkelet($('vagt-skel'), 3);
    $('vagt-footer').hidden = true;

    sb.from('listings').select('*').order('next_check_at', { ascending:true }).limit(100)
      .then(function(res){
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
          .order('at', { ascending:true }).limit(500)
          .then(function(ev){
            VAGT_EVENTS = {};
            (ev.data || []).forEach(function(e){
              (VAGT_EVENTS[e.listing_id] = VAGT_EVENTS[e.listing_id] || []).push(e);
            });
            tegnVagt(alle);
          });
      });
  }

  function tegnVagt(alle){
    var krop = $('vagt-body');
    var aktive = alle.filter(function(l){ return l.status === 'aktiv' || l.status === 'pause'; });
    var solgte = alle.filter(function(l){ return l.status === 'solgt' || l.status === 'afsluttet'; });

    if(!alle.length){
      krop.innerHTML = '<div class="empty"><h3>Ingen annoncer at holde øje med</h3>' +
        '<p>Når du lægger en annonce op på Vinted med automatikken, kommer den her af sig selv. ' +
        'Så holder prisvagten øje med den, indtil den er solgt.</p>' +
        '<p>Er annoncen lagt op uden om appen, så tilknyt den på udkastets side. ' +
        'Først når annoncerne står her, kan der læres af, hvad der sælger.</p></div>';
      $('vagt-footer').hidden = true;
      return;
    }

    var h = '';
    var venter = aktive.filter(function(l){ return venterFelter(l).length; }).length;
    var forfaldne = aktive.filter(function(l){
      return l.status === 'aktiv' && l.auto && new Date(l.next_check_at) <= new Date();
    }).length;

    h += '<p class="note vagt-intro">Prisvagten måler markedet fra din egen Vinted-session — ' +
         'Vinted svarer ikke på serverkald. Derfor sker både tjekket og prisændringen, ' +
         'når du åbner Vinted herfra.</p>';

    h += '<div class="sect">' + aktive.map(vagtRaekke).join('') + '</div>';
    if(solgte.length){
      h += '<details class="sect"><summary class="label">Solgt eller taget hjem (' + solgte.length + ')</summary>' +
        solgte.map(function(l){
          return '<div class="hist-row"><div><div class="t">' + esc(l.title || '') + '</div>' +
            '<div class="s">' + (l.sold_price != null ? 'solgt for ' + esc(String(l.sold_price)) : esc(String(l.price))) + ' kr · lå ' +
            (dageSiden(l.listed_at) - dageSiden(l.sold_at)) + ' dage · ' +
            esc(prisKaede(l)) + '</div></div></div>';
        }).join('') + '</details>';
    }
    h += '<div class="sect laer" id="laer"></div>';
    krop.innerHTML = h;
    hentLaerdomme();

    Array.prototype.forEach.call(krop.querySelectorAll('[data-v]'), function(el){
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

    // Foden: ét tryk, der aabner Vinted og lader automatikken goere resten.
    var fod = $('vagt-footer');
    if(venter){
      fod.innerHTML = '<button type="button" class="btn btn-primary" id="vagt-go">Send ' +
        venter + (venter === 1 ? ' rettelse' : ' rettelser') + ' til Vinted</button>';
      fod.hidden = false;
      $('vagt-go').addEventListener('click', function(){
        var f = aktive.filter(function(l){ return venterFelter(l).length; })[0];
        aabnUdad('https://www.vinted.dk/items/' + f.external_id + '/edit');
      });
    } else if(forfaldne){
      fod.innerHTML = '<button type="button" class="btn btn-primary" id="vagt-go">Tjek ' +
        forfaldne + (forfaldne === 1 ? ' vare' : ' varer') + ' mod markedet</button>';
      fod.hidden = false;
      $('vagt-go').addEventListener('click', function(){
        var f = aktive.filter(function(l){
          return l.status === 'aktiv' && l.auto && new Date(l.next_check_at) <= new Date();
        })[0];
        aabnUdad('https://www.vinted.dk/items/' + f.external_id + '?udbakke=vagt');
      });
    } else {
      fod.hidden = true;
    }
  }

  function vagtHandling(v, l, btn){
    if(v === 'saet'){
      aabnUdad('https://www.vinted.dk/items/' + l.external_id + '/edit');
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
      var svar = window.prompt('Hvad blev den solgt for? (kr)', String(l.price));
      if(svar === null) return;
      var kr = prisTal(svar);
      if(!isFinite(kr) || kr <= 0){ toast('Skriv prisen i hele kroner'); return; }
      btn.disabled = true;
      sb.from('listings').update({ status:'solgt', sold_at:new Date().toISOString(), sold_price: kr,
        pending:null, pending_note:null }).eq('id', l.id).then(function(res){
        if(res.error){ btn.disabled = false; toast('Kunne ikke gemme: ' + res.error.message); return; }
        sb.from('price_events').insert({ listing_id: l.id, kind:'solgt', price: kr,
          from_price: l.price, favourites: l.favourites, note:'markeret solgt i appen' }).then(function(){});
        toast('Flyttet til solgt'); hentVagt();
        // Et salg er ny viden; gennemgangen siger selv til, hvis det er for tidligt.
        laerNu(true);
      });
    }
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
      if(r.counterPrice) h += '<b>Modbud: ' + esc(String(r.counterPrice)) + ' kr</b>';
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
    sb.from('listings').select('id, pending, next_check_at, status, auto')
      .eq('status','aktiv').then(function(res){
        var n = (res.data || []).filter(function(l){
          return venterFelter(l).length || (l.auto && new Date(l.next_check_at) <= new Date());
        }).length;
        var el = $('vagt-tal');
        if(!el) return;
        el.textContent = String(n);
        el.hidden = !n;
      });
  }

  $('m-vagt').addEventListener('click', function(){ show('vagt'); hentVagt(); });

  $('m-hist').addEventListener('click', function(){ show('hist'); hentHistorik(); });

  function hentKoe(){
    visSkelet($('queue-loading'), 3);
    $('queue-empty').hidden = true;
    sb.from('drafts').select('*').in('status', ['ny','afventer','kladde'])
      .order('created_at', { ascending:false })
      .then(function(res){
        if(res.error){
          visFejl($('queue-loading'), 'Køen kunne ikke hentes',
            res.error.message || 'Forbindelsen svarede ikke.', hentKoe);
          return;
        }
        (res.data || []).forEach(function(d){ rows[d.id] = d; });
        renderQueue();
      });
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
    aabnFraAdresse();

    sb.channel('drafts-live').on('postgres_changes',
      { event:'*', schema:'public', table:'drafts' }, function(p){
        if(p.eventType === 'DELETE') delete rows[p.old.id];
        else rows[p.new.id] = p.new;
        renderQueue();
      }).subscribe();
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
