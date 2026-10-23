# Reproducible Windows installer build.
# NoctorInk itself cannot run in this container: it is a Windows overlay.
# The image installs dependencies and packages the app with electron-builder.
#
# Prefer `docker compose run --rm build` so the installer is written to ./dist
# on the host. `docker build` also packages the app, but the artifacts stay
# inside the image unless you copy them out.
FROM electronuserland/builder:wine

WORKDIR /project

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node scripts/generate-icons.js \
  && npx electron-builder --win --publish never
