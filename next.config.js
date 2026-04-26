/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
};
module.exports = nextConfig;
import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
