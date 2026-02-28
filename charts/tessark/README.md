# Tessark Helm Chart


This Helm chart deploys the Tessark application (Next.js frontend + Rust backend) on Kubernetes.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- Ingress controller: Traefik or Nginx Ingress Controller
- (Optional) cert-manager for automatic TLS certificates

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-username/tessark.git
cd tessark/helm/tessark
```

### 2. Customize values

Edit `values.yaml` or create a custom `custom-values.yaml` file:

```yaml
# custom-values.yaml
ingress:
  host: tessark.yourdomain.com

backend:
  image:
    repository: ghcr.io/your-username/tessark-backend

frontend:
  image:
    repository: ghcr.io/your-username/tessark-frontend
```

### 3. Install the chart

```bash
# With default values
helm install tessark . -n tessark --create-namespace

# With custom values
helm install tessark . -n tessark --create-namespace -f custom-values.yaml
```

## Configuration

### Backend

| Parameter | Description | Default |
|-----------|-------------|---------|
| `backend.replicaCount` | Number of replicas | `2` |
| `backend.image.repository` | Docker image repository | `ghcr.io/klementxv/tessark-backend` |
| `backend.image.tag` | Image tag | `latest` |
| `backend.image.pullPolicy` | Image pull policy | `Always` |
| `backend.service.port` | Service port | `8080` |
| `backend.resources.requests.memory` | Memory request | `128Mi` |
| `backend.resources.limits.memory` | Memory limit | `512Mi` |
| `backend.env.RUST_LOG` | Rust log level | `info` |

### Frontend

| Parameter | Description | Default |
|-----------|-------------|---------|
| `frontend.replicaCount` | Number of replicas | `2` |
| `frontend.image.repository` | Docker image repository | `ghcr.io/klementxv/tessark-frontend` |
| `frontend.image.tag` | Image tag | `latest` |
| `frontend.image.pullPolicy` | Image pull policy | `Always` |
| `frontend.service.port` | Service port | `8080` |
| `frontend.resources.requests.memory` | Memory request | `256Mi` |
| `frontend.resources.limits.memory` | Memory limit | `512Mi` |

### Ingress

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.type` | Ingress controller type (`traefik` or `nginx`) | `traefik` |
| `ingress.host` | Domain name | `tessark.example.com` |
| `ingress.tls.enabled` | Enable TLS | `true` |
| `ingress.tls.certResolver` | cert-manager resolver | `letsencrypt` |
| `ingress.tls.secretName` | Existing TLS secret (optional) | `""` |
| `ingress.traefik.entryPoints` | Traefik entry points | `["websecure"]` |
| `ingress.nginx.ingressClassName` | Nginx ingress class | `nginx` |
| `ingress.nginx.annotations` | Nginx annotations | `{}` |

## Usage Examples

### Use custom domain

```yaml
# custom-values.yaml
ingress:
  host: app.mydomain.com
```

```bash
helm upgrade tessark . -n tessark -f custom-values.yaml
```

### Use Nginx Ingress Controller

```yaml
# custom-values.yaml
ingress:
  type: nginx
  host: tessark.mydomain.com
  nginx:
    ingressClassName: nginx
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
      nginx.ingress.kubernetes.io/ssl-redirect: "true"
      nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
```

```bash
helm install tessark . -n tessark --create-namespace -f custom-values.yaml
```

### Use Traefik with custom entry points

```yaml
# custom-values.yaml
ingress:
  type: traefik
  host: tessark.mydomain.com
  traefik:
    entryPoints:
      - websecure
      - web
  tls:
    enabled: true
    certResolver: letsencrypt
```

```bash
helm install tessark . -n tessark --create-namespace -f custom-values.yaml
```

### Use your own Docker registry

```yaml
# custom-values.yaml
backend:
  image:
    repository: ghcr.io/myusername/backend
    tag: v1.0.0

frontend:
  image:
    repository: ghcr.io/myusername/frontend
    tag: v1.0.0
```

### Scale replicas

```yaml
# custom-values.yaml
backend:
  replicaCount: 3

frontend:
  replicaCount: 5
```

### Increase resources

```yaml
# custom-values.yaml
backend:
  resources:
    limits:
      memory: "1Gi"
      cpu: "2000m"
```

### Disable TLS (Traefik)

```yaml
# custom-values.yaml
ingress:
  type: traefik
  tls:
    enabled: false
  traefik:
    entryPoints:
      - web  # HTTP instead of HTTPS
```

### Disable TLS (Nginx)

```yaml
# custom-values.yaml
ingress:
  type: nginx
  tls:
    enabled: false
```

## Upgrading

```bash
helm upgrade tessark . -n tessark
```

## Uninstall

```bash
helm uninstall tessark -n tessark
```

## Verification

Check deployment status:

```bash
# Check Helm release
helm status tessark -n tessark

# Check pods
kubectl get pods -n tessark

# Check services
kubectl get svc -n tessark

# Check ingress routes (Traefik)
kubectl get ingressroutes -n tessark

# Check ingress (Nginx)
kubectl get ingress -n tessark

# View backend logs
kubectl logs -n tessark -l app=tessark-backend

# View frontend logs
kubectl logs -n tessark -l app=tessark-frontend
```

## Troubleshooting

### Images not pulling

Make sure your images are public or configure `imagePullSecrets`:

```yaml
# Create secret
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=your-username \
  --docker-password=your-token \
  -n tessark
```

Then add to your values:

```yaml
backend:
  imagePullSecrets:
    - name: ghcr-secret

frontend:
  imagePullSecrets:
    - name: ghcr-secret
```

### Pods in CrashLoopBackOff

Check logs:

```bash
kubectl logs -n tessark -l app=tessark-backend --tail=100
kubectl logs -n tessark -l app=tessark-frontend --tail=100
```

### Ingress not working

#### For Traefik

Verify Traefik is installed and IngressRoute is created:

```bash
kubectl get ingressroutes -n tessark
kubectl describe ingressroute tessark-frontend-ingressroute -n tessark
```

#### For Nginx

Verify Nginx Ingress Controller is installed and Ingress is created:

```bash
kubectl get ingress -n tessark
kubectl describe ingress tessark-frontend-ingress -n tessark

# Check nginx ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License
