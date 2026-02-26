/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const controlBase = process.env.CONTROL_API_BASE || "http://127.0.0.1:18100";
    return [
      {
        source: "/control/:path*",
        destination: `${controlBase}/:path*`
      }
    ];
  }
};

export default nextConfig;

