# syntax=docker/dockerfile:1.7
ARG RUST_VERSION=1.83
ARG APP_NAME=helmer-api

FROM rust:${RUST_VERSION}-bookworm AS builder
WORKDIR /app

# Copy manifests first for better caching
COPY Cargo.toml Cargo.lock ./

# Build dependencies only (cache this layer)
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src target/release/helmer-api* target/release/.fingerprint/helmer-api-*

# Copy source code and build application
COPY . .
ENV CARGO_TERM_COLOR=never
RUN cargo build --release --bin helmer-api && \
    strip /app/target/release/helmer-api

FROM debian:bookworm-slim
ARG APP_NAME=helmer-api
ARG APP_UID=1000
WORKDIR /app

# Dépendances runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    skopeo \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Utilisateur non-root système (sans shell)
RUN useradd -r -u ${APP_UID} -g users -d /nonexistent -s /usr/sbin/nologin helmer

# Binaire
COPY --from=builder /app/target/release/helmer-api /usr/local/bin/helmer-api

USER ${APP_UID}
ENV RUST_LOG=info \
    PORT=8080 \
    SKOPEO_PATH=/usr/bin/skopeo
EXPOSE 8080

CMD ["/usr/local/bin/helmer-api"]
