import { NextResponse } from 'next/server';
import { DarajaC2BPayload } from '@/lib/daraja/types';

export async function POST(request: Request) {
  try {
    const payload: DarajaC2BPayload = await request.json();

    // Safaricom validation expects quick response
    // We can validate that payload has minimal required fields
    if (!payload.TransID || !payload.TransAmount) {
      return NextResponse.json({
        ResultCode: 'C2B00016',
        ResultDesc: 'Missing required parameters',
      });
    }

    // Accept payment
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
  } catch (error) {
    // In case of error, Safaricom recommends accepting to avoid blocking customer funds
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
  }
}
