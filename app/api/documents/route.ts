import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSecret } from '@/lib/auth';
import { getDocuments } from '@/lib/database';

export async function GET(request: NextRequest) {
  if (!validateAdminSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const documents = await getDocuments();
    return NextResponse.json(documents, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
