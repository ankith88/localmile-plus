import { messaging, db } from '../firebase/config';
import { getToken, onMessage } from 'firebase/messaging';
import type { MessagePayload } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';



export const requestNotificationPermission = async () => {
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(messaging, {
        vapidKey: "BGTuK0h--lutVcb11CtbPp2VQVWkXhWGVtjS9g_riHztBrGlHRWZthQiM1NiUQoqfUHDlmqpvdPfec9E7Y5v8Gw",
        serviceWorkerRegistration: registration
      });
      return token;
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
  }
  return null;
};

export const saveTokenToFirestore = async (token: string, type: 'parent' | 'operator' | 'customer', id: string) => {
  try {
    if (type === 'parent' || type === 'operator') {
      // Save to users/{id}
      const userRef = doc(db, 'users', id);
      await updateDoc(userRef, {
        fcmTokens: arrayUnion(token)
      });
    } else {
      // Save to requests/{id}
      const requestRef = doc(db, 'requests', id);
      await updateDoc(requestRef, {
        customerTokens: arrayUnion(token)
      });
    }
  } catch (error) {
    console.error('Error saving FCM token to Firestore:', error);
  }
};

export const onForegroundMessage = () => {
  if (!messaging) return;

  onMessage(messaging, (payload: MessagePayload) => {
    console.log('[FCM] Foreground message received:', payload);

    // Read from data if notification is missing (to prevent double notifications)
    const title = payload.notification?.title || payload.data?.title || 'New Message';
    const body = payload.notification?.body || payload.data?.body;
    const link = payload.fcmOptions?.link || payload.data?.link || '/';

    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: body,
        icon: '/favicon.svg',
      });

      notification.onclick = (event) => {
        event.preventDefault();
        window.open(link, '_blank');
        notification.close();
      };
    }
  });
};
