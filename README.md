# Convertidor YouTube/Spotify MP3 - Frontend

Frontend de la aplicacion para convertir videos y playlists de YouTube a MP3 por lote. Tambien acepta links publicos de Spotify como fuente de metadata: el backend lee track, album o playlist de Spotify y luego busca cada cancion en YouTube para descargarla con yt-dlp.

## Repositorios

- Frontend: https://github.com/Acopet1/Convertidor-youtube-frontend
- Backend: https://github.com/Acopet1/Convertidor-youtube-backend

Este repositorio contiene solo el frontend. Para que funcione completo necesita que el backend este levantado y accesible desde la URL definida en `VITE_API_URL`.

## Stack

- React
- TypeScript
- Vite
- CSS propio
- API REST consumida desde el backend ASP.NET Core

## Funciones

- Agregar links de videos individuales.
- Agregar links de playlists completas de YouTube.
- Agregar links publicos de tracks, albums y playlists de Spotify.
- Validar formato del link antes de mandarlo a descarga.
- Consultar progreso del backend mientras descarga.
- Mostrar conteo de canciones descargadas y esperadas cuando el backend lo reporta.
- Mostrar detalles de canciones que no pudieron descargarse.
- Descargar automaticamente el ZIP generado por el backend al terminar.

## Requisitos

- Node.js 20.19 o superior, o Node.js 22.13 o superior recomendado.
- npm.
- Backend corriendo en `http://localhost:5000` o en la URL configurada.

Si ves warnings `EBADENGINE` al instalar, actualiza Node a una version compatible con las dependencias modernas de Vite/ESLint.

## Configuracion

Copia `.env.example` o crea el archivo `.env` en la raiz del frontend:

```env
VITE_API_URL=http://localhost:5000
```

Si despliegas el backend en otra URL, cambia el valor:

```env
VITE_API_URL=https://tu-backend.com
```

El backend tambien debe permitir el origen del frontend en su configuracion CORS. En desarrollo normalmente el frontend corre en:

```txt
http://localhost:5173
```

## Instalacion

```powershell
npm.cmd install
```

## Ejecutar en desarrollo

```powershell
npm.cmd run dev
```

La aplicacion se abre normalmente en:

```txt
http://localhost:5173
```

## Scripts disponibles

```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run lint
npm.cmd run preview
```

## Relacion con el backend

El frontend consume estos endpoints del backend:

```txt
POST /api/links/validate
POST /api/download-jobs
GET  /api/download-jobs/{jobId}
GET  /api/download-jobs/{jobId}/download
```

Flujo principal:

1. El usuario pega un link.
2. El frontend llama `POST /api/links/validate` para validar el formato.
3. El usuario presiona `Descargar todo`.
4. El frontend crea un job con `POST /api/download-jobs`.
5. El frontend consulta `GET /api/download-jobs/{jobId}` cada 1.5 segundos.
6. Cuando el backend termina, el frontend abre `GET /api/download-jobs/{jobId}/download` para descargar el ZIP.

Las consultas repetidas que ves en DevTools durante una descarga son polling local hacia el backend, no llamadas directas a YouTube.

## Links soportados

Puedes pegar links como:

```txt
https://www.youtube.com/watch?v=VIDEO_ID
https://www.youtube.com/playlist?list=PLAYLIST_ID
https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
https://open.spotify.com/track/TRACK_ID
https://open.spotify.com/album/ALBUM_ID
https://open.spotify.com/playlist/PLAYLIST_ID
```

El frontend envia el link completo al backend. Para YouTube el backend descarga directo. Para Spotify el backend usa Spotify solo como metadata, revisa varios candidatos de YouTube por cancion y prefiere lyric/official audio con duracion parecida.

## Estados de descarga

El frontend maneja estos estados por item:

```txt
queued
processing
completed
partial
error
```

`partial` significa que el backend logro descargar al menos un MP3, pero alguna cancion fallo. En ese caso la app muestra detalles en `failedTracks` cuando estan disponibles.

## Errores comunes

### El frontend no conecta con el backend

Revisa que `VITE_API_URL` apunte a la API correcta y que el backend este corriendo.

### Error CORS

Agrega la URL del frontend en `Cors:AllowedOrigins` del backend. Para desarrollo debe estar permitido:

```txt
http://localhost:5173
```

### No descarga el ZIP al final

Revisa en la pestana Network que exista respuesta de:

```txt
GET /api/download-jobs/{jobId}/download
```

Si el job queda en `error`, el backend no genero MP3 validos para comprimir.

### La barra no cambia en cada segundo exacto

La barra depende de la salida real de `yt-dlp` que recibe el backend. El frontend consulta el progreso cada 1.5 segundos para evitar ruido innecesario.

### Spotify no descarga

Spotify necesita credenciales configuradas en el backend: `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET`. Esas claves salen de una app creada en `https://developer.spotify.com/dashboard` y nunca deben ponerse en el frontend ni subirse a GitHub.

El README del backend explica el paso a paso para crear la app de Spotify, copiar `Client ID` / `Client Secret` y configurar las variables de entorno. Si faltan, el backend devuelve un error claro en la fila del item.

### Error 403 o 429

Estos errores vienen normalmente de YouTube, Spotify o `yt-dlp`:

- `403`: acceso denegado, bloqueo temporal, region, cliente rechazado o contenido que requiere sesion.
- `429`: demasiadas solicitudes o rate limit.
- `Sin match en YouTube`: el backend leyo la metadata de Spotify, pero no encontro una version limpia aceptable en YouTube. Puede pasar si solo aparecen karaoke, covers, remixes, lives o versiones raras.

El backend esta configurado en modo conservador para reducir estos casos, pero no se pueden eliminar al 100% porque dependen de YouTube.

## Estructura

```txt
src/
  App.tsx
  App.css
  main.tsx
  index.css
public/
.env
package.json
vite.config.ts
```

## Subida a GitHub

Repositorio esperado para este frontend:

```txt
https://github.com/Acopet1/Convertidor-youtube-frontend
```

Antes de subir, confirma que `.env` no contenga secretos. Para este proyecto solo contiene la URL publica/local del backend.

## Nota de uso

Usa la herramienta solo con contenido que tengas permiso de descargar o convertir. Spotify se usa solo como metadata, no como fuente directa de audio. El proyecto depende de `yt-dlp`, `ffmpeg`, Spotify Web API y la disponibilidad de YouTube.