# Atlas CRM React + Node

Migracion base del CRM logistico a una arquitectura mas profesional:

- `frontend/`: React servido directo en navegador
- `backend/`: Node + Express
- Persistencia local en `JSON`

## Instalacion

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

En Windows tambien puedes arrancarlo con:

```bat
start-react-crm.cmd
```

## Acceso demo

- Usuario: `admin`
- Contrasena: `admin123`

## Notas

- El backend sirve el frontend en `http://127.0.0.1:4100`.
- Los datos se guardan en `backend/data/crm-data.json`.

## Publicarlo En Internet

La forma mas simple para que otras personas entren sin instalar nada es desplegarlo en Render.

## Vercel

Tambien puedes desplegarlo en Vercel con dominio gratis `.vercel.app`, pero en Vercel debes usar una base de datos real.

### Variables necesarias

- `DATABASE_URL`

### Despliegue

1. Sube esta carpeta a GitHub.
2. Importa el repo en Vercel.
3. En `Root Directory`, usa `react-crm`.
4. Agrega la variable `DATABASE_URL`.
5. Despliega.

### Nota

- Localmente seguira usando JSON si no defines `DATABASE_URL`.
- En Vercel usara Postgres automaticamente cuando exista `DATABASE_URL`.

### Opcion recomendada: Render

1. Sube esta carpeta a GitHub.
2. En Render, crea un nuevo servicio desde el repositorio.
3. Usa el archivo [render.yaml](/C:/Users/HP/Documents/Codex/2026-04-26-creame-un-crm-logistico/react-crm/render.yaml).
4. Render te dara una URL publica tipo:

```text
https://logicrm.onrender.com
```

### Importante

- Esta version usa persistencia en archivo JSON.
- Para que no se pierdan datos en Render, ya quedo configurado un disco persistente con `DATA_DIR=/var/data`.
- Tus usuarios solo abriran la URL publica en su navegador; no necesitan instalar nada.
