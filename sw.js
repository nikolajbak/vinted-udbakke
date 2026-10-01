// Service worker til web-push. Viser notifikationen naar der kommer en push,
// og aabner appen paa det rigtige sted, naar man trykker paa den.
self.addEventListener('push', function(e){
  var d = {};
  try { d = e.data.json(); } catch(_) {}
  e.waitUntil(self.registration.showNotification(d.title || 'VintedAuto', {
    body: d.body || '',
    icon: 'icons/icon-512.png',
    badge: 'icons/icon-512.png',
    data: { url: d.url || '/vinted-udbakke/' },
    tag: d.tag || 'udbakke'
  }));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/vinted-udbakke/';
  e.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(list){
    for (var i=0;i<list.length;i++){
      if (list[i].url.indexOf('/vinted-udbakke') > -1 && 'focus' in list[i]){
        // Peger notifikationen paa en bestemt vare (#v42), skal den aabne,
        // ogsaa naar appen allerede staar aaben — ellers lander man bare dér,
        // hvor man slap.
        var c = list[i];
        if (url.indexOf('#v') > -1 && 'navigate' in c) return c.navigate(url).then(function(w){ return (w || c).focus(); });
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
