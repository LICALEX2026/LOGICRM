# LOGICRM

CRM logistico para ventas y operaciones, pensado para controlar clientes, envios, unidades, operadores y alertas en un solo tablero.

## Que hace

- Control de clientes, contactos y prioridades comerciales
- Registro y seguimiento de envios con bitacora por guia
- Administracion de operadores y unidades
- Alertas para incidencias, pendientes y actividad operativa
- Acceso por roles: administrador, operaciones, ventas, cliente y logistica / trafico
- Vista central para revisar cambios y actividad reciente
- Funcionamiento local con persistencia en SQLite

## Como ejecutarlo

En PowerShell, desde esta carpeta:

```powershell
.\start-react-crm.ps1
```

Despues abre:

```text
http://127.0.0.1:4100
```

## Acceso demo

- Usuario: `admin`
- Contrasena: `admin123`

## Credenciales de prueba

- `operaciones / operaciones123`
- `ventas / ventas123`
- `disnorte / cliente123`
- `farmared / cliente123`

## Notas

- La base local se crea automaticamente en `backend/data/crm-data.json`.
- El frontend se sirve desde `frontend/`.
- La version publica para Vercel vive en este mismo repo.
