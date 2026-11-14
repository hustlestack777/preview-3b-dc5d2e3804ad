/* Basic per-IP abuse limit for Camille chat. A normal visit stays under it. */

export function createIpAbuseLimit({ limit = 40, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();
  return function allowed(ip, now = Date.now()) {
    const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(ip, recent);
      return false;
    }
    recent.push(now);
    hits.set(ip, recent);
    return true;
  };
}
