import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createUser, userExists } from '@/lib/db';

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

    // Check if user already exists
    if (userExists(email)) {
      return NextResponse.json(
        { message: '此電子郵件已被註冊' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = createUser(email, hashedPassword);

    return NextResponse.json(
      {
        message: '註冊成功',
        user: {
          id: user.id,
          email: user.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { message: '註冊過程發生錯誤' },
      { status: 500 }
    );
  }
}