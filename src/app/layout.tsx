import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Import RainbowKit base styles
import '@rainbow-me/rainbowkit/styles.css';
// ConnectButton is now imported in Navbar.tsx

// Import the new Providers component
import { Providers } from './providers'; 
import { Navbar } from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OnGrid Protocol Admin",
  description: "Admin panel for managing OnGrid Protocol smart contracts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        <Providers>
          <Navbar />
          <div className="min-h-screen flex flex-col">
            {/* Header with Connect Button - THIS SECTION WILL BE REMOVED/SIMPLIFIED */}
            {/* <header className="bg-gray-100 border-b border-gray-200 py-4 px-6 flex justify-between items-center">
              <h1 className="text-xl font-semibold">OnGrid Protocol Admin</h1>
              <ConnectButton /> 
            </header> */}
            
            {/* Main Content */}
            <main className="flex-grow p-6">
              {children}
            </main>
            
            {/* Footer */}
            <footer className="bg-gray-100 border-t border-gray-200 py-4 px-6 text-center text-sm text-gray-600">
              OnGrid Protocol Admin Panel &copy; {new Date().getFullYear()}
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
