# Judicial Managment Mobile

Cliente móvil del ecosistema Judicial Managment para consulta y colaboración jurídica. Desarrollado con Expo, React Native y TypeScript.

## Funcionalidad

- Inicio de sesión, registro y confirmación de correo mediante backend de autenticación.
- Sesión persistente en el dispositivo con AsyncStorage.
- Pantallas de expedientes, movimientos, clientes, calendario, laboral, archivo, configuración y equipo.
- Chat por despacho con mensajes en tiempo real, adjuntos y enlaces privados temporales.
- Calendario local y recordatorios de audiencia mediante notificaciones del dispositivo.
- Personalización local del perfil.

## Estructura

`App.tsx` contiene la aplicación. `src/config.ts` centraliza configuración; `src/lib/` agrupa conexión al backend y comprobación de actualizaciones. `assets/` contiene recursos visuales y `scripts/` las tareas auxiliares.

## Desarrollo

Requiere Node.js, las dependencias fijadas en el lockfile y un dispositivo o entorno compatible con la versión de Expo declarada en `package.json`.

```powershell
npm ci
npm run typecheck
npm start
```

Otros comandos: `npm run android`, `npm run ios`, `npm run web` y `npm run start:tunnel`. La configuración de autenticación, tablas, almacenamiento y políticas debe corresponder al backend del entorno de desarrollo. Las credenciales de administración no deben incluirse en el cliente.

## Estado y límites

Aplicación en desarrollo. La existencia de una pantalla no implica que todos sus datos estén sincronizados: queda pendiente completar conexiones a tablas por despacho y sincronizar el calendario local. Los builds distribuibles mediante EAS son una fase independiente. Las herramientas exclusivas de escritorio permanecen en la aplicación Windows.

## Proyecto

[GitHub del desarrollador](https://github.com/YzDemnz) · [CV y portafolio](https://yzdemnz.github.io/cv-portafolio/)

Se conserva la licencia incluida en el repositorio.
