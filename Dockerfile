# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL=https://ndnypgqieourcxpghffd.supabase.co
ARG VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kbnlwZ3FpZW91cmN4cGdoZmZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMjEwMzQsImV4cCI6MjEwNzg5NzAzNH0.p858P-VTOjPRm9uwt-_CUfBzPFNt1B1brBYNsK2OBoA
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
