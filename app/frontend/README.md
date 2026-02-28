# Helmer Next.js

Application Next.js (App Router) pour explorer un dépôt Helm et télécharger des charts.

Fonctionnalités
- Entrer l’URL d’un dépôt Helm, chargement via API proxy (`/api/fetchIndex`) pour éviter CORS.
- Upload d’un `index.yaml` local en alternative.
- Liste des charts, filtrage, téléchargement des versions, résolution des URLs relatives.

## Démarrage
1. Installez les dépendances: `npm install`
2. Démarrez en dev: `npm run dev`
3. Ouvrez http://localhost:3000

## Notes
- Le proxy ne fait qu’un simple fetch, avec validation basique de l’URL (`http/https`).
- Lors d’un upload local, vous pouvez définir la base d’URL pour résoudre les liens relatifs.

## Téléchargement d'images via skopeo

Endpoint API: `GET /api/pull?ref=<image-ref>&format=<docker-archive|oci-archive>`

Paramètres
- `ref` (requis): référence d'image, ex. `docker.io/library/nginx:latest`.
- `format` (optionnel): `docker-archive` (défaut) ou `oci-archive`.

Validation et erreurs
- La référence est validée par regex: lettres/chiffres/`./:@_-` uniquement.
- En cas d'image introuvable → 404; accès refusé → 403; timeout → 504; autres erreurs skopeo → 502.

### Page UI
- Visitez `/pull` pour un petit formulaire qui redirige vers le téléchargement.

## Construire et lancer en conteneur (avec skopeo)

Deux images sont possibles:

- Frontend Next.js seul (proxy vers API Rust via `API_BASE`): `next-app/Dockerfile`
- API Rust (Axum) avec `skopeo`: `rust-api/Dockerfile`

Build et run API Rust
```bash
cd rust-api
docker build -t helmer-api .
docker run --rm -p 8080:8080 helmer-api
```

Tester l'API avec curl
```bash
curl -fL "http://localhost:8080/api/pull?ref=docker.io/library/nginx:latest&format=docker-archive" -o nginx.tar
ls -lh nginx.tar
```

Lancer le frontend et pointer vers l'API Rust
```bash
cd next-app
npm install
API_BASE=http://localhost:8080 npm run dev
# Ouvrez http://localhost:3000/fr
```

### Dépannage

- Erreur: `spawn skopeo ENOENT`
  - Cause: le binaire `skopeo` n'est pas disponible dans l'environnement serveur.
  - Solutions:
    - En dev local: installez skopeo et vérifiez votre PATH
      - macOS (Homebrew): `brew install skopeo`
      - Debian/Ubuntu: `sudo apt-get update && sudo apt-get install -y skopeo`
      - Fedora: `sudo dnf install -y skopeo`
    - Ou lancez via Docker (image fournie installe skopeo).
    - Option: définir la variable d'env `SKOPEO_PATH` vers le chemin du binaire (ex: `/opt/homebrew/bin/skopeo`).
