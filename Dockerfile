FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ vips-dev
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p session temp logs
EXPOSE 3000
CMD ["node", "--experimental-sqlite", "index.js"]
