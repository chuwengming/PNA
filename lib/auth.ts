import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { callPythonApi } from '@/lib/python-api';

interface AuthUser {
  id: number;
  email: string;
  name?: string | null;
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await callPythonApi<AuthUser | null>('/api/python/auth/verify', {
            method: 'POST',
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!user) {
            return null;
          }

          return {
            id: String(user.id),
            name: user.name ?? undefined,
            email: user.email,
          };
        } catch (error) {
          console.error('Credentials authorization error:', error);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      if (account?.provider === 'google') {
        token.provider = 'google';
        if (user?.email) {
          try {
            const dbUser = await callPythonApi<AuthUser>('/api/python/auth/oauth-user', {
              method: 'POST',
              body: JSON.stringify({
                email: user.email,
                name: user.name,
                provider: 'google',
              }),
            });
            token.id = String(dbUser.id);
          } catch (error) {
            console.error('Google user persistence error:', error);
            token.id = account.providerAccountId
              ? `google:${account.providerAccountId}`
              : user.email;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});