import { redirect } from 'next/navigation';

// Redirect to home if auth is bypassed (local development)
const isAuthBypassed = process.env.AUTH_BYPASS_LOCAL === 'true';

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  if (isAuthBypassed) {
    redirect('/');
  }

  return children;
}
