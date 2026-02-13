import { redirect } from 'next/navigation';
import { isAuthBypassed } from '@/lib/auth-bypass';

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  if (isAuthBypassed) {
    redirect('/');
  }

  return children;
}
