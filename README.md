# 🐾 Mascolandia

App para mascotas: **salud, rutinas y gastos**, construida con [Capacitor](https://capacitorjs.com) (web + Android nativo).

> ⚠️ **Importante**: Mascolandia **no ofrece diagnósticos veterinarios**. La app organiza información y consultas informativas; ante cualquier síntoma, acude a tu veterinario.

## Funcionalidades

### Núcleo (gratuito)
- 🐶 **Múltiples mascotas** con perfil (especie, raza, nacimiento, peso, emoji)
- ❤️ **Historial de salud**: vacunas, desparasitación, visitas al veterinario, tratamientos y control de peso
- ⏰ **Rutinas**: comida, paseos, medicación… con horario y días de la semana
- 💰 **Gastos**: registro por categorías, total mensual y gráfico por categoría

### Suscripción Premium (pago vía Transfermóvil/USSD)
- 📚 Historial médico ilimitado (gratis: últimos 10 registros)
- 🔔 Recordatorios automáticos con notificaciones locales
- 🐾 Múltiples mascotas (gratis: 1)
- 📊 Informes de salud exportables (compartir/descargar)
- 💳 Pago interno: tarjeta + PIN cifrados (AES-256-GCM) en el dispositivo; el pago se realiza vía USSD de Transfermóvil (BANMET/BANDEC) hacia la tarjeta destino `9224959877215184` (configurable en `DESTINATION_CARD`, `www/js/ussd.js`). El usuario solo ve confirmación o error.
- 🧪 Precios de prueba: 1–2 CUP

### Compras integradas (IAP, pago por USSD)
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

## Pagos (Transfermóvil / USSD)

- Tarjeta y PIN se guardan **cifrados con AES-256-GCM** (Web Crypto) en el almacenamiento local; la clave se guarda por separado. En producción, migrar la clave a **Android Keystore** para mayor seguridad.
- Flujo de pago (`www/js/ussd.js`): autenticación USSD según banco (`*444*40*03#` BANMET / `444*4002#` BANDEC) → transferencia con plantilla `*444*45*{destino}*{importe}#` → consulta de saldo `*444*46#`.
- **Ajusta la plantilla de transferencia** (`TRANSFER_TEMPLATE`) al formato exacto de tu banco si difiere.
- **Tarjeta destino configurada**: `9224959877215184` (en `DESTINATION_CARD`, `www/js/ussd.js`).
- El plugin nativo `UssdPlugin.java` marca el código con `ACTION_CALL` (permiso `CALL_PHONE`). Android no expone la respuesta USSD a apps normales: la confirmación de débito se basa en que la marcación se realice; para verificación real del débito, integra la API del banco o verifica el saldo con `*444*46#` manualmente.
- En navegador (sin nativo), el pago se simula para poder probar la UI.

## Producción

- **Consultas veterinarias**: la solicitud queda registrada localmente; conectar con tu backend de veterinarios asociados.
- Las notificaciones usan `@capacitor/local-notifications` (sin servidor).
