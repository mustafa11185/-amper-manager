export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { handleWebhook } from '../_handler';

export async function POST(req: NextRequest) {
  return handleWebhook(req, 'qi');
}
