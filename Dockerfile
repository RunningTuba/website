FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# Dependencies first, so editing site content does not invalidate the install.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application server.
COPY server ./server

# Web root. `public/` contains nothing but web assets, so no config, secret or
# source file can ever be reached over HTTP.
COPY public ./public

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
