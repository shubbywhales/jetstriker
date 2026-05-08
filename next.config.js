     1|import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
     2|
     3|// Local standalone dev helper only.
     4|// Playground preview/deploy uses the custom in-memory Next runtime instead,
     5|// so generated app code should not import OpenNext runtime APIs like
     6|// @opennextjs/cloudflare or getRequestContext() for normal product features.
     7|if (process.env.NODE_ENV !== 'production') {
     8|	initOpenNextCloudflareForDev();
     9|}
    10|
    11|/** @type {import('next').NextConfig} */
    12|const nextConfig = {
    13|	reactStrictMode: true,
    14|};
    15|
    16|export default nextConfig;
    17|