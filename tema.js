/* Temaet saettes, foer siden tegnes, saa den ikke blinker i det forkerte.
   "enhed" (ingen data-theme) foelger telefonen; "lys"/"moerk" tvinger. */
window.saetTema = function(t){
  var r = document.documentElement;
  if(t === 'lys' || t === 'moerk') r.setAttribute('data-theme', t === 'lys' ? 'light' : 'dark');
  else r.removeAttribute('data-theme');
  var m = document.querySelectorAll('meta[name="theme-color"]');
  for(var i = 0; i < m.length; i++){
    var lys = m[i].getAttribute('data-lys');
    if(lys === null){ lys = m[i].getAttribute('media').indexOf('light') > -1 ? '1' : '0'; m[i].setAttribute('data-lys', lys); m[i].setAttribute('data-farve', m[i].content); }
    m[i].content = t === 'lys' ? '#F6F4EF' : t === 'moerk' ? '#121619' : m[i].getAttribute('data-farve');
  }
};
try{ saetTema(localStorage.getItem('udbakke-tema') || 'enhed'); }catch(e){}
