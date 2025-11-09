import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers'; // <--- 【修改點 1】導入 Providers 元件

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Project Network | PNA',
  description: 'Advanced network analysis with stochastic environment and precise analysis',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* <--- 【修改點 2】使用 Providers 包裹 children */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}