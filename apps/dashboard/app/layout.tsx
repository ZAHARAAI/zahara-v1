import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '../styles/globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Zahara Dashboard',
  description: 'Agent Runtime Dashboard with Upload Wizard, Builder, and Clinic',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-neutral-50">
          <nav className="bg-white shadow-sm border-b border-neutral-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex items-center">
                  <h1 className="text-xl font-semibold text-neutral-900">
                    Zahara Dashboard
                  </h1>
                </div>
                <div className="flex items-center space-x-4">
                  <a href="/upload" className="text-neutral-600 hover:text-neutral-900 px-3 py-2 rounded-md text-sm font-medium">
                    Upload
                  </a>
                  <a href="/builder" className="text-neutral-600 hover:text-neutral-900 px-3 py-2 rounded-md text-sm font-medium">
                    Builder
                  </a>
                  <a href="/clinic" className="text-neutral-600 hover:text-neutral-900 px-3 py-2 rounded-md text-sm font-medium">
                    Clinic
                  </a>
                </div>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
