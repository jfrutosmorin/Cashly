# Mis Finanzas — PWA con Firebase (A2)

Aplicación web instalable (PWA) para iPhone/iPad y desktop, con **sincronización entre dispositivos** usando **Firebase** (Auth anónima + Firestore).

## 1) Crea tu proyecto en Firebase (gratis)
1. Ve a https://console.firebase.google.com → *Add project* → elige un nombre (p.ej. `mis-finanzas`).
2. Habilita **Google Analytics** en *OFF* (opcional).
3. En el panel, pulsa el icono `</>` (Web) para **añadir una app web** y copia la **configuración** (apiKey, authDomain, projectId, etc.).
4. En el apartado **Authentication** → *Sign-in method* → **habilita `Anonymous`**.
5. En **Firestore Database** → *Create database* → modo **Production** → ubicación por defecto.

## 2) Configura `firebase.js`
1. Abre `firebase.js` y **reemplaza** los valores de `firebaseConfig` por los tuyos.
2. No hace falta tocar nada más. El código inicia sesión anónima y activa la persistencia offline.

## 3) Prueba en local
- Sirve la carpeta desde un servidor estático (o abre `index.html` directamente; en iOS Safari funciona, pero para SW recomienda https).
- Para un servidor simple con Python:
  ```bash
  cd mi-finanzas-pwa
  python3 -m http.server 8000
  ```
  Luego abre `http://localhost:8000`

## 4) Publica gratis en GitHub Pages
1. Crea un repositorio en GitHub (p.ej. `mis-finanzas`).
2. Sube todos los archivos de esta carpeta.
3. En **Settings → Pages**: Source = `Deploy from a branch`, Branch = `main` (o `master`) y la carpeta raíz `/`.
4. Espera a que se despliegue. Te dará una URL del estilo `https://tu-usuario.github.io/mis-finanzas`.

> **Nota:** El `service worker` en esta plantilla usa rutas absolutas `/...`. Si prefieres servir desde subruta (`/mis-finanzas/`), edita `sw.js` para usar rutas relativas (`'./index.html'`, `'./styles.css'`, etc.) o pon `start_url` relativo en `manifest.webmanifest`.

## 5) Instálala en iPhone/iPad (PWA)
1. Abre la URL en Safari.
2. Pulsa **Compartir** → **Añadir a pantalla de inicio**.
3. Se instalará con icono, pantalla completa y funcionará **offline** (después del primer uso).

## 6) Uso básico
- Botón **＋** para añadir movimiento (Ingreso/Gasto).
- Selector de **mes** para navegar entre meses.
- **Gráfico** donut por gasto en categorías.
- **Exportar** JSON y **Importar** JSON para copias de seguridad manuales o migración.
- **Editar**/**Eliminar** desde cada tarjeta.

## 7) Reglas de seguridad (opcional, recomendado)
En *Firestore → Rules* puedes restringir datos para usuarios anónimos (cada UID solo accede a su espacio):
```
// /firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
Publica estas reglas desde la consola o con las herramientas de Firebase.

## 8) Personalización rápida
- Cambia categorías en `app.js` (`CATEGORIES`).
- Colores, tipografías y tamaños en `styles.css`.
- Íconos en `assets/` (192/512).

## 9) Problemas comunes
- **No carga Firebase:** revisa `firebase.js` (credenciales correctas).
- **PWA no se instala:** visita la app 2 veces, refresca; asegúrate de servir por **HTTPS**.
- **Gráfico vacío:** no hay *gastos* en el mes; solo suma gastos.
- **SW y rutas en GitHub Pages:** si ves 404 al offline, usa rutas relativas en `sw.js`.

¡Disfruta y cualquier ajuste que quieras, me dices! ✨
