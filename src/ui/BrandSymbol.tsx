import Image from "next/image";

export function BrandSymbol({ className = "" }: { className?: string }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={className}
      data-testid="brand-symbol"
      height={96}
      src="/brand/veritas-book-sprout-final.png"
      unoptimized
      width={136}
    />
  );
}
