// Rellena tu config de Firebase aquí (copiar desde la consola de Firebase → SDK web)
const firebaseConfig = {
  apiKey: "AIzaSyBHwehIYeWXOEZJdmOW5ZssPJ88bt0V3wY",
  authDomain: "cashly-26.firebaseapp.com",
  projectId: "cashly-26",
  storageBucket: "cashly-26.firebasestorage.app",
  messagingSenderId: "657916520307",
  appId: "1:657916520307:web:0f5620ba6b3104d8b94706",
  measurementId: "G-1CC2RFGNQD"
};

// Firebase v10 modular por CDN
import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js').then(({ initializeApp }) => {
  const app = initializeApp(firebaseConfig);
  return Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]).then(([authMod, fsMod]) => {
    const { getAuth, signInAnonymously, onAuthStateChanged } = authMod;
    const { getFirestore, enableIndexedDbPersistence } = fsMod;
    const auth = getAuth(app);
    const db = getFirestore(app);
    enableIndexedDbPersistence(db).catch(() => {/* Safari Private Mode u otros casos */});
    signInAnonymously(auth).catch(console.error);
    onAuthStateChanged(auth, (user) => {
      if (user) {
        window.__firebase = { app, auth, db, user };
        document.dispatchEvent(new CustomEvent('firebase-ready'));
      }
    });
  });
}).catch(err => {
  console.error(err);
  alert('Error cargando Firebase. Revisa firebase.js');
});
