import React, { useState } from "react";

type BlueprintCoverProps = {
  src?: string | null;
  title: string;
  className?: string;
};

/**
 * A defensive cover renderer for third-party image hosts. The image remains a
 * browser-native lazy request; if a host rejects it, the card keeps its layout
 * and switches to an intentional reading-cover fallback instead of a broken icon.
 */
export function BlueprintCover({ src, title, className = "" }: BlueprintCoverProps) {
  const [failed, setFailed] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div data-testid="result-cover" className={`relative w-full aspect-[16/9] overflow-hidden rounded-t-2xl bg-slate-900 ${className}`}>
      {showImage ? (
        <>
          {isPortrait && <img src={src ?? undefined} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl" />}
          <img
            src={src ?? undefined}
            alt={`《${title}》封面`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={(event) => setIsPortrait(event.currentTarget.naturalHeight > event.currentTarget.naturalWidth)}
            onError={() => setFailed(true)}
            className="relative z-10 block h-full w-full object-cover"
          />
        </>
      ) : (
        <div role="img" aria-label={`${title} 的預設作品封面`} className="h-full w-full bg-gradient-to-br from-indigo-50/60 via-purple-50/40 to-pink-50/50 dark:from-slate-800/80 dark:to-slate-900" />
      )}
    </div>
  );
}
