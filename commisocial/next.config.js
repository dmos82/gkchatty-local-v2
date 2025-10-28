/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,  // FIX #2: Disable for testing - React 19 strict mode may interfere with Supabase
}

module.exports = nextConfig