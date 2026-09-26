/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp", "tesseract.js", "pdf-parse", "pdf-to-img", "@prisma/client", "prisma"],
  // Next 16 bloqueia HMR/assets cross-origin no `next dev` — necessário em produção com domínio.
  allowedDevOrigins: [
    "matheusbrizza.com",
    "www.matheusbrizza.com",
    "179.197.64.72",
  ],
};

export default nextConfig;
