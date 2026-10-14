FROM nginx:1.27-alpine

ENV PORT=8080

# Static site assets
COPY . /usr/share/nginx/html

# Drop repo-only files that must not be web-served
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/railway.json \
          /usr/share/nginx/html/.dockerignore \
          /usr/share/nginx/html/.gitignore

# Config is rendered by the nginx image entrypoint (envsubst on *.template)
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1
