const pythonApiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';

/** @type {import('next').NextConfig} */
const nextConfig = {
    rewrites: async () => {
      return [
        {
          source: "/api/python/:path*",
          destination: `${pythonApiUrl}/api/python/:path*`,
        },
        {
          source: "/mcp",
          destination: `${pythonApiUrl}/mcp`,
        },
        {
          source: "/mcp/:path*",
          destination: `${pythonApiUrl}/mcp/:path*`,
        },
      ];
    },
  };
module.exports = nextConfig;
