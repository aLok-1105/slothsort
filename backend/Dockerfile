FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV FILES_DIR=/files
EXPOSE 3001
CMD ["npm","start"]
