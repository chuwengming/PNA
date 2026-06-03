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
          const oauthPayload = JSON.stringify({
            email: user.email,
            name: user.name,
            provider: 'google',
          });

          const persistGoogleUser = async (): Promise<AuthUser> => {
            const maxAttempts = 4;
            let lastError: unknown;
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
              try {
                return await callPythonApi<AuthUser>('/api/python/auth/oauth-user', {
                  method: 'POST',
                  body: oauthPayload,
                });
              } catch (error) {
                lastError = error;
                if (attempt < maxAttempts) {
                  await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
                }
              }
            }
            throw lastError;
          };

          try {
            const dbUser = await persistGoogleUser();
            token.id = String(dbUser.id);
          } catch (error) {
            console.error('Google user persistence error:', error);
            try {
              const existing = await callPythonApi<AuthUser | null>(
                '/api/python/auth/user-by-email',
                {
                  method: 'POST',
                  body: oauthPayload,
                },
              );
              if (existing?.id) {
                token.id = String(existing.id);
              } else {
                token.id = account.providerAccountId
                  ? `google:${account.providerAccountId}`
                  : user.email;
              }
            } catch (lookupError) {
              console.error('Google user lookup by email error:', lookupError);
              token.id = account.providerAccountId
                ? `google:${account.providerAccountId}`
                : user.email;
            }
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