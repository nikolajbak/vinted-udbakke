// Kun til afproevning af layoutet lokalt: rigtige raekker, ingen netvaerk.
(function(){
  var now = Math.floor(Date.now()/1000) + 86400;
  localStorage.setItem('sb-gjycsqshkvkcupdnvgvf-auth-token', JSON.stringify({
    access_token: 'proeve.proeve.proeve', refresh_token: 'proeve', token_type: 'bearer',
    expires_in: 86400, expires_at: now, user: { id: '00000000-0000-0000-0000-000000000000', aud: 'authenticated', role: 'authenticated', email: 'proeve@local' }
  }));
  var data = {};
  ['drafts','listings','price_events','puls','forbrug','laerdomme'].forEach(function(t){
    var x = new XMLHttpRequest(); x.open('GET', 'proeve/' + t + '.json', false); x.send();
    data[t] = JSON.parse(x.responseText || '[]');
  });
  // Til at lave en opgave fra konsollen, fx en koeberbesked:
  // __proeveData.koeber_beskeder = [{ id: 1, kilde: 'mail', item_title: '…', buyer_message: '…' }]
  window.__proeveData = data;

  function gr(navn, dom, solgt, vb, varer, ekstra){
    return Object.assign({ navn: navn, dom: dom, solgt: solgt, vurderbare: vb, varer: varer,
      medianDageTilSalg: solgt ? 4 : null, medianSalgspris: solgt ? 149 : null, medianAfNypris: solgt ? 46 : null,
      hjerterPrDag: 0.6, sikkerhed: vb >= 3 ? 'bygger på ' + vb + ' bedømte varer' : 'et fingerpeg, ikke et mønster',
      nr: [12, 19, 23] }, ekstra || {});
  }
  var INDKOB = {
    regler: { stilleDage: 14, hurtigDage: 7 },
    helhed: gr('Alle', 'saelger', 5, 9, 14),
    sammenligning: gr('Brugte', 'traeg', 3, 20, 31),
    anbefaling: { overblik: 'Nye jakker og skjorter fra Teeshoppen sælger hurtigt og tæt på halvdelen af nyprisen. Børnetøj går trægt.',
      koebIgen: [{ navn: 'Teeshoppen · Jakker', hvorfor: 'tre af fire solgt på under en uge' }],
      ladVaere: [{ navn: 'Børnetøj', hvorfor: 'intet solgt af fem bedømte' }] },
    kategorier: [gr('Jakker', 'let', 3, 4, 5), gr('Skjorter', 'saelger', 2, 3, 4), gr('Børnetøj', 'traeg', 0, 5, 5), gr('Kjoler', 'tidligt', 0, 0, 2)],
    produkter: [gr('Teeshoppen · Jakker', 'let', 3, 4, 4), gr('Teeshoppen · Skjorter', 'saelger', 2, 3, 3), gr('Nike · Børnetøj', 'traeg', 0, 3, 3), gr('Name It · Børnetøj', 'lovende', 0, 1, 2)]
      .map(function(g){ g.enkelte = [{ nr: 54, titel: 'Teeshoppen Hooded Let Puffer Jakke', udfald: 'solgt efter 3 dage', hjerter: 4, nypris: 1000, andelAfNypris: 45, nedsaettelser: 0 },
        { nr: 56, titel: 'Roly softshell jakke str. L', udfald: 'ude i 16 dage', hjerter: 1, nedsaettelser: 1 }]; return g; })
  };
  var ægte = window.fetch;
  window.fetch = function(url, opt){
    url = String(url && url.url || url);
    if(url.indexOf('supabase.co') < 0) return ægte.apply(this, arguments);
    var m = url.match(/\/rest\/v1\/([a-z_]+)\??(.*)$/), body = [];
    var method = (opt && opt.method) || 'GET';
    // Til fejltest fra konsollen: window.__proeveFejl = { url: /listings/, method: 'GET', status: 0 }
    // (status 0 = netvaerket svarer ikke). once: true rammer kun det foerste kald.
    // Hver skrivning noteres, saa en test kan taelle dem.
    if(method !== 'GET' || window.__proeveAlle) (window.__proeveKald = window.__proeveKald || []).push(method + ' ' + url.replace(/^.*\/rest\/v1\//, ''));
    var f = window.__proeveFejl;
    if(f && f.url.test(url) && (!f.method || f.method === method)){
      if(f.once) window.__proeveFejl = null;
      if(!f.status) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response(JSON.stringify({ message: 'prøvefejl' }), { status: f.status, headers: { 'Content-Type': 'application/json' } }));
    }
    // »Køb igen« regnes af serveren (og kalder en model) - her et fast
    // eksempel i samme form, saa skaermen kan ses uden at koste noget.
    var mode = ''; try { mode = JSON.parse(opt && opt.body || '{}').mode || ''; } catch(e){}
    if(/\/functions\//.test(url) && mode === 'indkob') body = INDKOB;
    // En PATCH laegges ind i hukommelsen, saa en genhentning ser den (intet sendes).
    if(m && method === 'PATCH'){
      var ret = {}; try { ret = JSON.parse(opt.body || '{}'); } catch(e){}
      var filt = []; new URLSearchParams(m[2]).forEach(function(v, k){ var e = v.match(/^eq\.(.*)$/); if(e) filt.push([k, e[1]]); });
      (data[m[1]] || []).forEach(function(r){ if(filt.length && filt.every(function(f){ return String(r[f[0]]) === f[1]; })) Object.assign(r, ret); });
    }
    if(m && method === 'GET'){
      body = (data[m[1]] || []).slice();
      new URLSearchParams(m[2]).forEach(function(v, k){
        var e = v.match(/^eq\.(.*)$/);
        if(e && k !== 'select') body = body.filter(function(r){ return String(r[k]) === e[1]; });
      });
      // drafts hentes med listings(...) indlejret; det kan mock'en ikke af
      // sig selv, saa annoncerne laegges paa ud fra draft_id.
      if(m[1] === 'drafts' && /listings%28|listings\(/.test(m[2])){
        body = body.map(function(d){
          return Object.assign({}, d, { listings: (data.listings || []).filter(function(l){ return l.draft_id === d.id; }) });
        });
      }
      var h = opt && opt.headers; var acc = h && (h.get ? h.get('Accept') : h.Accept || h.accept);
      if(acc && /pgrst\.object/.test(acc)) body = body[0] || null;
    }
    // Langsomt net: window.__proeveVent = { url: /listings/, ms: 1500, once: true }
    // - eller localStorage 'proeveVent' = '{"url":"listings","ms":1500}' til en genindlaesning.
    var v = window.__proeveVent; try { if(!v && localStorage.getItem('proeveVent')){ v = JSON.parse(localStorage.getItem('proeveVent')); v.url = new RegExp(v.url); } } catch(e){}
    var svar = new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/' + (Array.isArray(body) ? body.length : 1) } });
    if(v && v.url.test(url) && method === 'GET'){
      if(v.once) window.__proeveVent = null;
      return new Promise(function(r){ setTimeout(function(){ r(svar); }, v.ms); });
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/' + (Array.isArray(body) ? body.length : 1) } }));
  };
})();
