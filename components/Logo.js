import Image from 'next/image';

export default function Logo() {
  return (
    <div className="flex items-center justify-center mb-8">
      <Image 
        src="/logo.png" 
        alt="Drive & Shine" 
        width={280} 
        height={140}
        priority
      />
    </div>
  );
}

