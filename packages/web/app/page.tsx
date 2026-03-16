import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-950">
      <h1 className="text-4xl font-bold text-white">TrackSync</h1>
      <p className="mt-4 text-slate-400">Admin panel</p>
      <Link
        href="/auth/login"
        className="mt-8 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
      >
        Sign in
      </Link>
    </main>
  )
}
