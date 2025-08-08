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

// Inicialización modular Firebase v10
import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js').then(({ initializeApp }) => {
  const app = initializeApp(firebaseConfig);

  return Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]).then(([authMod, fsMod]) => {
    const { 
      getAuth, 
      onAuthStateChanged, 
      signInWithEmailAndPassword, 
      createUserWithEmailAndPassword, 
      signOut 
    } = authMod;
    const { getFirestore, enableIndexedDbPersistence } = fsMod;

    const auth = getAuth(app);
    const db = getFirestore(app);

    // Permitir cache offline
    enableIndexedDbPersistence(db).catch(() => {
      console.warn("IndexedDB no disponible (modo privado u otra limitación)");
    });

    // Guardamos en global para poder usar en app.js
    window.__firebase = { app, auth, db };

    // Escucha cambios de autenticación
    onAuthStateChanged(auth, (user) => {
      if (user) {
        window.__firebase.user = user;
        document.dispatchEvent(new CustomEvent('firebase-ready'));
      } else {
        // Si no hay usuario, mostrar diálogo de login
        const dlg = document.getElementById('authDialog');
        if (dlg) dlg.showModal();
      }
    });

    // Exponer helpers de login/registro/cerrar sesión globalmente
    window.__authActions = {
      login: (email, password) => signInWithEmailAndPassword(auth, email, password),
      register: (email, password) => createUserWithEmailAndPassword(auth, email, password),
      logout: () => signOut(auth)
    };
  });

}).catch(err => {
  console.error(err);
  alert('Error cargando Firebase. Revisa firebase.js');
});
