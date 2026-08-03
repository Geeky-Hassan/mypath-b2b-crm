import { Link } from 'react-router-dom'
import { Button } from '../components/ui'

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
      <div>
        <p className="text-sm font-bold text-blue-700">404</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Page not found</h1>
        <p className="mt-2 text-slate-500">This CRM page does not exist.</p>
        <Link to="/dashboard">
          <Button className="mt-6">Return to dashboard</Button>
        </Link>
      </div>
    </main>
  )
}
