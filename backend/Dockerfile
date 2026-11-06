FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --ignore-scripts
COPY backend backend
USER node
EXPOSE 3000
CMD ["npm", "start", "-w", "backend"]
