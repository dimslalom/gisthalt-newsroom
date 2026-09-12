/** @type {import('next').NextConfig} */
export default {
  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ['@newsroom/core', '@newsroom/db', '@newsroom/design', '@newsroom/render', '@newsroom/brands', '@newsroom/brand-f1', '@newsroom/workers', '@newsroom/pipeline', '@newsroom/llm', '@newsroom/publish', '@newsroom/sources'],
  serverExternalPackages: ['playwright', 'sharp', 'postgres', 'graphile-worker'],
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};
