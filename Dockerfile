FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

# Next.js standalone requires static files to be copied manually
RUN cp -r .next/static .next/standalone/.next/static
RUN if [ -d "public" ]; then cp -r public .next/standalone/public; fi

# Copy prisma files for migrate deploy
RUN cp -r prisma .next/standalone/prisma
RUN cp -r node_modules/.prisma .next/standalone/node_modules/.prisma
RUN cp -r node_modules/@prisma .next/standalone/node_modules/@prisma
RUN cp package.json .next/standalone/

WORKDIR /app/.next/standalone
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && HOSTNAME=0.0.0.0 node server.js"]
