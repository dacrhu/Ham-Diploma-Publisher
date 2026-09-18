FROM node:22

# Rendszer-Chromium a Puppeteer-hez (vízjelezés, elrendezés-előnézet, PDF
# oklevél-generálás — M4-től) — lásd docker/Dockerfile.dev ugyanezt a fejlesztői
# képhez. A PUPPETEER_EXECUTABLE_PATH env változónak (dev.env / prod env) erre
# kell mutatnia, hogy a Puppeteer ne próbálja letölteni a saját (~300MB) Chromiumát.
# A 3 font-csomag az oklevél-szövegekhez választható fontokat adja (lásd
# modules/certificate-renderer.js FONT_FAMILIES).
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		chromium \
		fonts-liberation2 \
		fonts-ebgaramond \
		fonts-dancingscript \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY build/ .

EXPOSE 8000
CMD ["/bin/bash", "start-prod.sh"]
