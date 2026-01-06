import { NextResponse } from 'next/server';
import { importCsv, CsvType } from '@/lib/importers';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const forceType = formData.get('type') as CsvType | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const csvContent = await file.text();
    const result = await importCsv(csvContent, forceType || undefined);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
