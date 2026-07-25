/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // /people/org was a mock-data-only page (never backed by the real
      // Organization domain) that collided with the real Settings >
      // Organization surface. Temporary (non-permanent) so old bookmarks
      // still land somewhere real instead of 404ing.
      { source: "/people/org", destination: "/settings/organization", permanent: false },
      { source: "/people/org/chart", destination: "/settings/organization/org-units", permanent: false },
    ];
  },
};

export default nextConfig;
