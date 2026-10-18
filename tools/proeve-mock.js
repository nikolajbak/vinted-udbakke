// Kun til afproevning af layoutet lokalt: rigtige raekker, ingen netvaerk.
(function(){
  var now = Math.floor(Date.now()/1000) + 86400;
  localStorage.setItem('sb-gjycsqshkvkcupdnvgvf-auth-token', JSON.stringify({
    access_token: 'proeve.proeve.proeve', refresh_token: 'proeve', token_type: 'bearer',
    expires_in: 86400, expires_at: now, user: { id: '00000000-0000-0000-0000-000000000000', aud: 'authenticated', role: 'authenticated', email: 'proeve@local' }
  }));
  var data = {};
  ['drafts','listings','price_events','puls','forbrug'].forEach(function(t){
    var x = new XMLHttpRequest(); x.open('GET', 'proeve/' + t + '.json', false); x.send();
    data[t] = JSON.parse(x.responseText || '[]');
  });
  var ægte = window.fetch;
  window.fetch = function(url, opt){
    url = String(url && url.url || url);
    if(url.indexOf('supabase.co') < 0) return ægte.apply(this, arguments);
    var m = url.match(/\/rest\/v1\/([a-z_]+)\??(.*)$/), body = [];
    var method = (opt && opt.method) || 'GET';
    if(m && method === 'GET'){
      body = (data[m[1]] || []).slice();
      new URLSearchParams(m[2]).forEach(function(v, k){
        var e = v.match(/^eq\.(.*)$/);
        if(e && k !== 'select') body = body.filter(function(r){ return String(r[k]) === e[1]; });
      });
      var h = opt && opt.headers; var acc = h && (h.get ? h.get('Accept') : h.Accept || h.accept);
      if(acc && /pgrst\.object/.test(acc)) body = body[0] || null;
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/' + (Array.isArray(body) ? body.length : 1) } }));
  };
})();
