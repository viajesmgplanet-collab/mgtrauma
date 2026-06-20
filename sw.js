// MGtrauma Service Worker - Notificaciones Push
self.addEventListener('install', function(e){
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(self.clients.claim());
});

// Recibir notificación push
self.addEventListener('push', function(e){
  var data={titulo:'MGtrauma',cuerpo:'Tienes un aviso pendiente'};
  try{ data=e.data.json(); }catch(err){}
  e.waitUntil(
    self.registration.showNotification(data.titulo||'MGtrauma',{
      body: data.cuerpo||'',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      requireInteraction: true,
      vibrate: [200,100,200],
      tag: data.tag||'mgtrauma',
      data: data
    })
  );
});

// Al tocar la notificación - abrir la app
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type:'window'}).then(function(cls){
      for(var i=0;i<cls.length;i++){
        if(cls[i].url&&cls[i].focus) return cls[i].focus();
      }
      if(self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
