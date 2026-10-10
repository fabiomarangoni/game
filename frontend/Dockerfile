# Etapa 1: gera o dist/ com o endereço da API
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src
ARG API_BASE_URL=http://localhost:3000
ENV API_BASE_URL=${API_BASE_URL}
RUN npm run build

# Etapa 2: serve os arquivos estáticos
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
