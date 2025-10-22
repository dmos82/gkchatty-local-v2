/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Enable standalone output for Docker builds
  output: 'standalone',
  
  // Preserve console.log statements for debugging
  compiler: {
    removeConsole: false,
  },
  
  webpack: (config, { isServer }) => {
    // Add this log just to show the webpack config is being processed
    if (!isServer) {
      console.log(`[Webpack Config] The copy-pdf-worker script handles copying the worker file`);
    }

    // Important: return the modified config
    return config;
  },
};

export default nextConfig; 