/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native modules must stay external to the server bundle: the catalog's
  // SQLite handle (better-sqlite3) is a .node addon and cannot be bundled.
  serverExternalPackages: ["better-sqlite3"],
};

module.exports = nextConfig;
