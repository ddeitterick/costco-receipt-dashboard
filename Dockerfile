FROM node:20-alpine

WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the application source.
COPY server.js dashboard.html ./

# Stored receipts live here; mount a volume to persist across containers.
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server.js"]
