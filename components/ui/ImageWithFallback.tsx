'use client';
import { useState, useEffect } from 'react';

interface ImageWithFallbackProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  isSmallThumb?: boolean;
  loading?: 'lazy' | 'eager';
}

export default function ImageWithFallback({
  src,
  alt = 'Imagem',
  className = 'w-full h-full object-cover',
  fallbackClassName = '',
  isSmallThumb = false,
  loading = 'lazy',
}: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false);

  const cleanSrc =
    src && typeof src === 'string' && src.trim() && src !== 'undefined' && src !== 'null'
      ? src.trim()
      : null;

  // Reseta o estado de erro caso o src mude
  useEffect(() => {
    setHasError(false);
  }, [cleanSrc]);

  // Se não houver src ou ocorrer erro no carregamento da imagem
  if (!cleanSrc || hasError) {
    if (isSmallThumb) {
      return (
        <div
          className={`w-full h-full bg-black flex flex-col items-center justify-center p-0.5 select-none text-center border border-white/10 ${fallbackClassName}`}
          title="Sem Imagem"
        >
          <span className="text-[7.5px] font-black text-white leading-[1.05] uppercase tracking-tighter">
            Sem
          </span>
          <span className="text-[7.5px] font-black text-white leading-[1.05] uppercase tracking-tighter">
            Imagem
          </span>
        </div>
      );
    }

    return (
      <div
        className={`w-full h-full bg-black flex flex-col items-center justify-center p-2 select-none text-center border border-white/10 ${fallbackClassName}`}
        title="Sem Imagem"
      >
        <span className="text-xs sm:text-sm font-black text-white tracking-wider uppercase drop-shadow">
          Sem Imagem
        </span>
      </div>
    );
  }

  return (
    <img
      src={cleanSrc}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}
