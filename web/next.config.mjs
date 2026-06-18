/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp", "tesseract.js", "pdf-parse", "pdf-to-img"],
};

export default nextConfig;
