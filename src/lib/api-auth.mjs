import { createHash, timingSafeEqual } from 'node:crypto';

export function authorizeOperator(request) {
  const expected = process.env.CONTROL_API_TOKEN;
  if (!expected || expected.length < 32)
    return Response.json({ error: 'Operator authentication not configured' }, { status: 503 });
  const actual = request.headers.get('authorization') || '';
  const digest = text => createHash('sha256').update(text).digest();
  if (!timingSafeEqual(digest(actual), digest(`Bearer ${expected}`)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}
