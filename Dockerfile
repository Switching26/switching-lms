FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
RUN cp -r .next/static .next/standalone/.next/static
RUN if [ -d "public" ]; then cp -r public .next/standalone/public; fi
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 PORT=${PORT:-3000} node .next/standalone/server.js"]
