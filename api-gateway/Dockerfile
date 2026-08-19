FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 4000
# Non-root user chalana security best-practice hai
USER node
CMD ["node", "src/index.js"]
