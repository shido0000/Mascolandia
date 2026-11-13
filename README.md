# 🐾 Mascolandia

App para mascotas: **salud, rutinas y gastos**, construida con [Capacitor](https://capacitorjs.com) (web + Android nativo).

> ⚠️ **Importante**: Mascolandia **no ofrece diagnósticos veterinarios**. La app organiza información y consultas informativas; ante cualquier síntoma, acude a tu veterinario.

## Funcionalidades

### Núcleo (gratuito)
- 🐶 **Múltiples mascotas** con perfil (especie, raza, nacimiento, peso, emoji)
- ❤️ **Historial de salud**: vacunas, desparasitación, visitas al veterinario, tratamientos y control de peso
- ⏰ **Rutinas**: comida, paseos, medicación… con horario y días de la semana
- 💰 **Gastos**: registro por categorías, total mensual y gráfico por categoría

### Suscripción Premium (simulada, lista para Google Play Billing)
- 📚 Historial médico ilimitado (gratis: últimos 10 registros)
- 🔔 Recordatorios automáticos con notificaciones locales
- 🐾 Múltiples mascotas (gratis: 1)
- 📊 Informes de salud exportables (compartir/descargar)

### Compras integradas (IAP, simuladas para la demo)
- 🎓 Plantillas de entrenamiento: obediencia básica, cachorro, paseo sin correa
- 🏃 Packs de ejercicios: juegos de interior, agility casero, ejercicios para gatos
- 🩺 Consultas veterinarias informativas (pack de 1 o 3 créditos), **sin diagnósticos**

### Configuración
- 🌐 **Multiidioma**: Español, English, Português (con detección automática)
- 🌗 **Modo claro / oscuro / sistema**
- 🔔 Activar/desactivar recordatorios
- ⬇️ Exportar datos en JSON · 🗑️ borrar todos los datos

## Estructura

```
www/                 App web (HTML/CSS/JS vanilla, ES modules)
  js/                Código fuente (empaquetado con esbuild)
  dist/app.js        Bundle generado (no editar, no se versiona)
android/             Proyecto Android nativo generado por Capacitor
.github/workflows/   CI: compila el APK automáticamente
```

## Desarrollo

```bash
npm install
npm run build          # empaqueta www/js → www/dist/app.js (esbuild)
npm run cap:sync       # build + copia www/ al proyecto Android
npm run open:android   # abre Android Studio
```

## Generar el APK

Requiere Android Studio (o SDK + JDK 17):

```bash
# Debug APK (instalable directamente)
npm run apk:debug
# → android/app/build/outputs/apk/debug/app-debug.apk

# Release (firmado con tu keystore)
npm run apk:release
```

También puedes generar un APK en la nube con GitHub Actions o configurar la firma en `android/app/build.gradle`.

## Producción

- **IAP / Suscripciones**: el flujo de compra está simulado en `www/js/iap.js` (`purchase()`), con el catálogo de productos (`productId`, precios). Conectar con `@capacitor-community/in-app-purchases` o Google Play Billing reemplazando esa función y validando el recibo en servidor.
- **Consultas veterinarias**: la solicitud queda registrada localmente; conectar con tu backend de veterinarios asociados.
- Las notificaciones usan `@capacitor/local-notifications` (sin servidor).
