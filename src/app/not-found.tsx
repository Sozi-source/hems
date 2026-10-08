import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold text-white">404</h2>
        <div>
          <Link href="/">
            <Button variant="primary" size="sm">
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
