import { timingSafeEqual } from 'node:crypto';

// Express middleware: require `Authorization: Bearer <token>` matching the expected token.
// Uses a constant-time comparison to avoid leaking the token via timing.
export function requireToken(expectedToken) {
  const expected = Buffer.from(expectedToken);

  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const match = header.match(/^Bearer (.+)$/);
    if (!match) {
      return res.status(401).json({ error: 'missing bearer token' });
    }

    const provided = Buffer.from(match[1]);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return res.status(401).json({ error: 'invalid token' });
    }

    next();
  };
}
