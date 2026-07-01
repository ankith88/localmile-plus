importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCEKfFKLTso-t3Lu6YV8XOpCCBF2az9Hcg",
  authDomain: "localmile-plus.firebaseapp.com",
  projectId: "localmile-plus",
  storageBucket: "localmile-plus.firebasestorage.app",
  messagingSenderId: "1058596386803",
  appId: "1:1058596386803:web:ee4cf205f3512224c70486"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Received background message ', payload);
  // We do NOT call showNotification here because the browser will now 
  // automatically show the formal 'notification' block we added to the backend.
  // This prevents the 'double notification' issue.
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Try to get the URL from the formal link field or our custom data fallback
  const urlToOpen = event.notification.data?.url || 
                    event.notification.data?.link || 
                    event.notification.click_action || 
                    '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. Check if the specific URL is already open in a tab
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // 2. If not, but any app window is open, just focus and navigate it
      if (windowClients.length > 0) {
        if (windowClients[0].navigate) {
          return windowClients[0].navigate(urlToOpen).then(c => c.focus());
        }
      }
      // 3. If no windows are open at all, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
