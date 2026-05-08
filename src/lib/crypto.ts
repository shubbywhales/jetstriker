     1|/**
     2| * Canonical Web Crypto helpers for generated Cloudflare/OpenNext apps.
     3| * Prefer these platform globals over Node crypto imports or UUID packages.
     4| */
     5|export function generateId(): string {
     6|  return crypto.randomUUID();
     7|}
     8|