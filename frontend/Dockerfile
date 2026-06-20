# ---- Build stage ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine

# Copy the built SPA
COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config: SPA fallback + /api/ reverse-proxy to backend-web
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
