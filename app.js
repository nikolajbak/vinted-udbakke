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

  function show(name, opts){
    opts = opts || {};
    var next = screenEl(name);
    var cur = stack.length ? screenEl(stack[stack.length - 1]) : null;
    if(cur === next) return;
    if(opts.replace && stack.length) stack[stack.length-1] = name; else stack.push(name);

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

  function back(){
    if(stack.length < 2) return;
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
    b.addEventListener('click', back);
  });

  /* ---- Kø --------------------------------------------------------------- */
  function statusChip(d){
    if(d.status === 'kladde') return '<span class="chip chip-vent">Kladde</span>';
    if(d.status === 'afventer'){
      var failed = (d.price_note || '').indexOf('Analyse mislykkedes') === 0;
      return '<span class="chip chip-vent">' + (failed ? 'Fejl' : 'Analyserer') + '</span>';
    }
    return '<span class="chip chip-ny">Ny</span>';
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
      var sub = d.status === 'ny'
        ? '<span class="row-price">' + esc(d.price || '') + '</span>'
        : (d.status === 'kladde'
            ? esc((d.photos || []).length + ' billeder taget')
            : esc(relTime(d.created_at)));
      return '<div class="swipe" data-id="' + esc(d.id) + '">' +
        '<button type="button" class="swipe-del" tabindex="-1" aria-label="Kassér udkastet">' +
          '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>' +
          '<span>Kassér</span>' +
        '</button>' +
        '<button type="button" class="row' + (d.status !== 'ny' ? ' is-muted' : '') +
             '" data-id="' + esc(d.id) + '">' +
        (d.image_url ? '<img src="' + esc(d.image_url) + '" alt="">' : '<span class="ph"></span>') +
        '<span class="row-main">' +
          '<span class="row-title">' + esc(d.title || (d.status === 'kladde' ? 'Ufærdig billedserie' : 'Analyserer billeder …')) + '</span>' +
          '<span class="row-sub">' + sub + '</span>' +
          '<span>' + statusChip(d) + '</span>' +
        '</span>' +
        '<span class="chev"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span>' +
        '</button>' +
      '</div>';
    }).join('');

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
  function openDetail(id){ currentId = id; renderDetail(); show('detail'); }

  function renderDetail(){
    var d = rows[currentId];
    if(!d) return;
    $('d-title').textContent = d.title || 'Udkast';
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

    if(d.status === 'ny'){
      html += '<div class="price-row"><span class="price-big mono">' + esc(d.price || '?') + '</span>' +
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
      html += '<div class="note" style="margin-top:16px">Claude analyserer billederne og skriver udkastet. Det tager typisk under et minut.</div>';
    }

    if(d.personal_info){
      html += '<div class="warn">Der blev fundet personlige oplysninger på et af billederne — fx et påsyet navnemærke — og de er automatisk maskeret. Tjek billederne, før du uploader.</div>';
    }
    html += '<div class="note" style="margin-top:16px">' + esc(relTime(d.created_at)) + '</div>';
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
    if(d.status === 'ny'){
      rest += '<button type="button" class="btn btn-quiet" data-a="copy">Kopiér tekst</button>' +
              '<button type="button" class="btn btn-quiet" data-a="posted">Markér som postet</button>';
    }
    rest += '<button type="button" class="btn btn-danger" data-a="discard">Kasser udkast</button></div>';
    $('d-body').insertAdjacentHTML('beforeend', rest);

    var f = '';
    if(d.status === 'ny'){
      f += '<button type="button" class="btn btn-primary" data-a="fill">Udfyld i Vinted</button>';
      f += '<button type="button" class="btn btn-secondary" data-a="dba">Udfyld i DBA</button>';
      // Reshopper staar paa linje med de to andre markedspladser. Den er en
      // afskrift og ikke en udfyldning, men for den der staar med varen er det
      // det samme valg: hvor skal den op?
      f += '<button type="button" class="btn btn-secondary" data-a="reshopper">Klargør til Reshopper</button>';
      f += '<button type="button" class="btn btn-secondary" data-a="save">Gem billeder i Fotos</button>';
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

  function detailAction(a, d, btn){
    if(a === 'fill'){
      btn.disabled = true; btn.textContent = 'Åbner Vinted …';
      sb.from('drafts').update({ selected_at: new Date().toISOString() }).eq('id', d.id).then(function(){
        // x-safari- tvinger Safari; ellers kaprer Vinteds Universal Links
        // adressen og åbner appen, hvor bogmærket ikke findes.
        window.location.href = 'x-safari-https://www.vinted.dk/items/new';
        setTimeout(function(){ btn.disabled = false; btn.textContent = 'Udfyld i Vinted'; }, 2500);
      });
    }
    else if(a === 'dba'){
      btn.disabled = true; btn.textContent = 'Åbner DBA …';
      sb.from('drafts').update({ selected_at: new Date().toISOString() }).eq('id', d.id).then(function(){
        // x-safari- af samme grund som på Vinted: DBA har sin egen app, og
        // deres universal links ville ellers kapre adressen og åbne den,
        // hvor brugerscriptet ikke findes.
        window.location.href = 'x-safari-https://www.dba.dk/create-item/start';
        setTimeout(function(){ btn.disabled = false; btn.textContent = 'Udfyld i DBA'; }, 2500);
      });
    }
    else if(a === 'reshopper') reshopper(d, btn);
    else if(a === 'copy'){
      var text = [d.title, d.description, d.price ? 'Pris: ' + d.price : ''].filter(Boolean).join('\n\n');
      if(navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ toast('Teksten er kopieret'); });
    }
    else if(a === 'save') savePhotos(d, btn);
    else if(a === 'posted'){
      sb.from('drafts').update({ status: 'afsendt', posted_at: new Date().toISOString() }).eq('id', d.id);
      back(); toast('Flyttet til afsendte annoncer');
    }
    else if(a === 'discard'){
      sb.from('drafts').update({ status: 'kasseret' }).eq('id', d.id);
      back(); toast('Udkastet er kasseret');
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
      btn.disabled = false; btn.textContent = 'Klargør til Reshopper';
      if(!r || r.error){ toast('Kunne ikke klargøre: ' + ((r && r.error) || 'ukendt fejl')); return; }
      visReshopper(d, r);
      // Billederne skal ligge i kamerarullen, INDEN Reshopper-appen åbnes —
      // ellers står man i deres billedvælger med en tom rulle.
      savePhotos(d, null);
    }).catch(function(){
      btn.disabled = false; btn.textContent = 'Klargør til Reshopper';
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
      '<button type="button" class="btn btn-primary" id="rs-open" style="margin-top:12px">Åbn Reshopper</button>' +
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
        photos[idx] = { path: path, url: url, kind: photos[idx].kind, optimized: true };
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
  function installer(url){
    window.location.href = 'x-safari-' + url;
  }
  $('m-userscript').addEventListener('click', function(){
    // Stien SKAL ende paa .user.js - ellers tilbyder Userscripts ikke at
    // installere den. Et forespoergselsparameter er ikke nok.
    installer(FILL_API.replace('?key=', '/udbakke.user.js?key='));
  });
  $('m-userscript-dba').addEventListener('click', function(){
    installer(DBA_API.replace('?key=', '/dba.user.js?key='));
  });

  $('m-copy').addEventListener('click', function(){
    navigator.clipboard.writeText(BOOKMARKLET).then(function(){
      toast('Koden er kopieret — indsæt den som bogmærkets adresse');
    }).catch(function(){ toast('Kunne ikke kopiere'); });
  });
  $('m-hist').addEventListener('click', function(){
    $('hist-body').innerHTML = '<p class="note">Henter …</p>';
    show('hist');
    sb.from('drafts').select('*').eq('status','afsendt').order('posted_at',{ascending:false}).limit(30)
      .then(function(res){
        var data = res.data || [];
        $('hist-body').innerHTML = data.length ? data.map(function(d){
          return '<div class="hist-row">' +
            (d.image_url ? '<img src="' + esc(d.image_url) + '" alt="">' : '') +
            '<div><div class="t">' + esc(d.title || '') + '</div>' +
            '<div class="s">' + esc(d.price || '') + ' · ' + esc(relTime(d.posted_at)) + '</div></div></div>';
        }).join('') : '<div class="empty"><p>Ingen postede annoncer endnu.</p></div>';
      });
  });

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

    sb.from('drafts').select('*').in('status', ['ny','afventer','kladde'])
      .order('created_at', { ascending:false })
      .then(function(res){
        if(res.error){ $('queue-loading').innerHTML = '<p>Kunne ikke hente køen. Prøv at genindlæse.</p>'; return; }
        (res.data || []).forEach(function(d){ rows[d.id] = d; });
        renderQueue();
      });

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
  var myBuild = null, lastCheck = 0, updateShown = false;

  function checkForUpdate(){
    var now = Date.now();
    if(updateShown || now - lastCheck < 60000) return;
    lastCheck = now;
    fetch(location.pathname, { method: 'HEAD', cache: 'no-store' }).then(function(r){
      var tag = r.headers.get('etag') || r.headers.get('last-modified');
      if(!tag) return;
      if(!myBuild){ myBuild = tag; return; }
      if(tag === myBuild) return;
      updateShown = true;
      var t = document.createElement('div');
      t.className = 'toast toast-action';
      var label = document.createElement('span');
      label.textContent = 'Der er kommet en ny udgave';
      var go = document.createElement('button');
      go.type = 'button'; go.textContent = 'Opdatér';
      go.addEventListener('click', function(){ location.reload(); });
      t.appendChild(label); t.appendChild(go);
      document.body.appendChild(t);
      // Banneret ligger fast i bunden og ville ellers daekke skaermen for evigt.
      // Det traekker sig, og faar lov at melde sig igen naeste gang appen
      // hentes frem - saa minder det om sig selv uden at staa i vejen.
      setTimeout(function(){ t.remove(); updateShown = false; }, 10000);
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
