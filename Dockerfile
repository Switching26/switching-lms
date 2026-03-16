FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
COPY start.sh ./start.sh
RUN chmod +x start.sh
EXPOSE 3000
CMD ["./start.sh"]
