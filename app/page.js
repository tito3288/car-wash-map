import Image from 'next/image';
import LoginForm from '@/components/LoginForm';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 font-sans p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <Image 
            src="/logo.png" 
            alt="Drive & Shine" 
            width={280} 
            height={140}
            priority
          />
        </div>
        
        {/* Login Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-blue-900 text-center mb-8">
            Log In
          </h1>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
