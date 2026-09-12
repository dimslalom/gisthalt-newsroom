FROM mcr.microsoft.com/playwright:v1.63.0-noble AS runtime
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 TZ=Australia/Brisbane
RUN npm install -g pnpm@9.15.9
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @newsroom/dashboard build
EXPOSE 3939 8787
CMD ["pnpm", "workers"]
