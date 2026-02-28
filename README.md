<<<<<<< HEAD
# Tessark-Tools
=======
# Tessark

Tessark est une application full-stack composee de:
- un frontend Next.js (App Router)
- un backend Rust (Axum) qui pilote `skopeo` pour exporter des images de conteneurs
- un chart Helm pour le deploiement Kubernetes

Le projet couvre deux usages principaux:
- explorer un depot Helm (`index.yaml`) et telecharger des charts
- telecharger des images OCI/Docker en archive (`docker-archive` ou `oci-archive`)

## Fonctionnalites

- Exploration de depots Helm avec recherche, tri et telechargement
- Proxy API pour recuperer `index.yaml` sans problemes CORS (`/api/fetchIndex`)
- Pull d'images avec progression en streaming (SSE)
- Authentification optionnelle au registre (username/password)
- Interface localisee (`fr`, `en`)
- Packaging Docker et deploiement Kubernetes via Helm

## Architecture

- `app/frontend`: interface Next.js et routes API proxy (`/api/*`)
- `app/backend`: API Rust sur le port `8080`
- `charts/tessark`: chart Helm pour frontend + backend + ingress

Flux principal image pull:
1. UI frontend (`/[locale]/pull`)
2. API Next.js (`/api/pull` ou `/api/pull/stream`)
3. API Rust (`/api/pull` ou `/api/pull/stream`)
4. `skopeo copy` vers un fichier temporaire
5. telechargement du tar via `/api/pull/file/:id`

## Prerequis

- Node.js 20+
- npm
- Rust (toolchain recente)
- `skopeo` installe sur la machine (si backend lance localement)
- Docker (optionnel)
- Kubernetes + Helm (optionnel)

## Demarrage local

### 1) Backend Rust

```bash
cd app/backend
cargo run
```

Le backend ecoute sur `http://localhost:8080`.

Variables utiles:
- `PORT` (defaut `8080`)
- `RUST_LOG` (defaut `info`)
- `SKOPEO_PATH` (defaut `skopeo`)

### 2) Frontend Next.js

```bash
cd app/frontend
npm install
BACKEND_URL=http://localhost:8080 npm run dev
```

Acces:
- `http://localhost:3000/fr`
- `http://localhost:3000/en`
- page pull: `http://localhost:3000/fr/pull`

## Lancement avec Docker

### Backend (compose fourni)

```bash
cd app/backend
docker compose up --build
```

### Frontend (image seule)

```bash
cd app/frontend
docker build -t tessark-frontend:local .
docker run --rm -p 3000:8080 \
  -e BACKEND_URL=http://host.docker.internal:8080 \
  tessark-frontend:local
```

Si `host.docker.internal` n'est pas resolu sur votre environnement, remplacez par l'IP/nom reseau approprie.

## API backend (Rust)

Base URL locale: `http://localhost:8080`

- `GET /health`
- `GET /ready`
- `GET /api/fetchIndex?url=<repo-url>`
- `GET /api/pull?ref=<image-ref>&format=<docker-archive|oci-archive>`
- `POST /api/pull`
- `POST /api/pull/stream` (events SSE: `start`, `progress`, `auth`, `ready`, `error`, `end`)
- `GET /api/pull/file/:id`

Exemple pull direct:

```bash
curl -fL "http://localhost:8080/api/pull?ref=docker.io/library/nginx:latest&format=docker-archive" -o nginx.tar
```

Exemple pull avec credentials (POST):

```bash
curl -X POST "http://localhost:8080/api/pull" \
  -H "Content-Type: application/json" \
  -d '{
    "ref": "ghcr.io/owner/private-image:latest",
    "format": "docker-archive",
    "username": "myuser",
    "password": "mytoken"
  }' \
  -o private-image.tar
```

## Deploiement Kubernetes (Helm)

Chart local: `charts/tessark`

```bash
helm upgrade --install tessark ./charts/tessark \
  --namespace tessark \
  --create-namespace \
  --set ingress.host=tessark.example.com
```

Parametres importants (`charts/tessark/values.yaml`):
- `backend.image.repository` / `backend.image.tag`
- `frontend.image.repository` / `frontend.image.tag`
- `ingress.enabled`
- `ingress.type` (`traefik` ou `nginx`)
- `ingress.host`
- `ingress.tls.enabled`

Verification:

```bash
kubectl get pods -n tessark
kubectl get svc -n tessark
kubectl get ingress -n tessark
kubectl get ingressroutes -n tessark
```

## Variables d'environnement frontend

Le frontend tente ces cibles backend, dans cet ordre:
1. `BACKEND_URL`
2. `NEXT_PUBLIC_BACKEND_URL`
3. `http://localhost:8080` (en dev)
4. `http://helmer-api:8080`
5. `http://tessark-backend-service:8080`

En production, definir explicitement `BACKEND_URL` est recommande.

## Structure du projet

```text
tessark/
  app/
    backend/
      src/main.rs
      Cargo.toml
      Dockerfile
      docker-compose.yml
    frontend/
      app/
      package.json
      Dockerfile
  charts/
    tessark/
      Chart.yaml
      values.yaml
      templates/
  README.md
```

## Notes

- Les references images sont validees par regex (`[A-Za-z0-9./:@_-]+`).
- Les archives temporaires sont ecrites dans `/tmp` puis supprimees.
- Le backend retourne des erreurs explicites (`404`, `403`, `502`, `504`) selon le cas.
>>>>>>> 08d8ebc (Initial commit)
