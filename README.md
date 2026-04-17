# ZBE Routes - Barcelona

Proyecto web estatico para visualizar camaras ZBE y calcular rutas en Barcelona.

## Requisitos

- Node.js 24+
- npm 11+

## Ejecutar en local

```bash
npm install
npm run dev
```

El servicio quedara en:

- http://localhost:5173

## Deploy manual a GitHub Pages

```bash
npm run deploy
```

Esto publica el contenido actual en la rama `gh-pages`.

## Deploy automatico

Hay un workflow en `.github/workflows/deploy-pages.yml`.

Cada push a `main` ejecuta deploy a GitHub Pages.

## Subir a GitHub

Si aun no inicializaste git en esta carpeta:

```bash
git init
git branch -M main
git add .
git commit -m "setup: npm, scripts y deploy"
git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
git push -u origin main
```

Despues activa Pages en GitHub:

- Settings -> Pages -> Build and deployment -> Source: GitHub Actions
