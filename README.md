# Judicial Managment Mobile

Aplicacion movil de Judicial Managment, creada con Expo, React Native y TypeScript.

## Ubicacion

El proyecto vive en:

`E:\Judicial Managment Suite\judicial-managment-mobile`

## Comandos

```powershell
npm run start
npm run start:tunnel
npm run android
npm run ios
npm run web
npm run typecheck
```

## Estado

- Login y registro conectados a Supabase Auth.
- Confirmacion de correo redirigida al portal web publicado.
- Sesion persistente en celular mediante AsyncStorage.
- Panel, Expedientes, Movimientos, Calendario, Clientes, Laboral, Archivo, Chat de equipo y Configuracion.
- Personalizacion local del perfil visible.
- Chat de equipo conectado a Supabase por despacho, con mensajes, realtime, adjuntos y enlaces privados firmados.
- Calendario local con recordatorios de audiencia usando notificaciones del dispositivo.
- La app movil se concentra en expedientes, audiencias, clientes, documentos y colaboracion; las herramientas de escritorio permanecen en la version de Windows.
- Branding con el logo actual.

## Siguiente fase

- Conectar cada pantalla a tablas reales por despacho.
- Sincronizar calendario local con Supabase.
- Sincronizacion opcional con calendario externo del telefono.
- Builds instalables con EAS para Android e iOS.
