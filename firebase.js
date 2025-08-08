// Configuración de tu proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBHwehIYeWXOEZJdmOW5ZssPJ88bt0V3wY",
  authDomain: "cashly-26.firebaseapp.com",
  projectId: "cashly-26",
  storageBucket: "cashly-26.firebasestorage.app",
  messagingSenderId: "657916520307",
  appId: "1:657916520307:web:0f5620ba6b3104d8b94706",
  measurementId: "G-1CC2RFGNQD"
};

// Carga modular por CDN
import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js').then(({ initializeApp }) => {
  // Inicializar app
  const app = initializeApp(firebaseConfig);

  return Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]).then(([authMod, fsMod]) => {
    const { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = authMod;
    const { getFirestore, enableIndexedDbPersistence } = fsMod;

    const auth = getAuth(app);
    const db = getFirestore(app);

    // Habilitar persistencia offline para Firestore
    enableIndexedDbPersistence(db).catch(() => { /* Safari Private Mode u otros casos */ });

    // Guardar funciones de auth en window para poder llamarlas desde la UI
    window.__firebase = { app, auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut };

    // Escuchar cambios de sesión
    onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("✅ Usuario autenticado:", user.email || user.uid);
    window.__firebase.user = user;
    document.dispatchEvent(new CustomEvent('firebase-ready'));
  } else {
    const dlg = document.getElementById('authDialog');
    if (dlg && !dlg.open) dlg.showModal(); // <-- muestra login si no hay sesión
  }
});
  });
}).catch(err => {
  console.error(err);
  alert('Error cargando Firebase. Revisa firebase.js');
});
