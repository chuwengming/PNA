import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { callPythonApi, PythonApiError } from '@/lib/python-api';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { message: '請提供電子郵件和密碼' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: '密碼長度至少需要 6 個字元' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const data = await callPythonApi<{
      message: string;
      user: { id: number; email: string };
    }>('/api/python/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, passwordHash: hashedPassword }),
    });

    return NextResponse.json(
      {
        message: data.message,
        user: data.user,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : '註冊過程發生錯誤' },
      { status: error instanceof PythonApiError ? error.status : 500 }
    );
  }
}