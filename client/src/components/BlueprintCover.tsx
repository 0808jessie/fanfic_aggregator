import { BookOpen, ImageOff } from "lucide-react";
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
export function BlueprintCover({ src, title, className = "aspect-video" }: BlueprintCoverProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div data-testid="result-cover" className={`relative overflow-hidden border-b border-[color:var(--atlas-line)] bg-[color:var(--atlas-elevated)] ${className}`}>
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={`《${title}》封面`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div role="img" aria-label={`${title} 的預設作品封面`} className="relative flex h-full w-full items-end justify-between overflow-hidden bg-[linear-gradient(135deg,rgba(79,70,229,0.16),rgba(255,255,255,0.84)_55%,rgba(251,191,36,0.16))] p-4 text-[color:var(--atlas-indigo)]">
          <div className="absolute -right-5 -top-6 h-28 w-28 rounded-full bg-white/45 blur-2xl" />
          <div className="absolute left-0 top-0 h-20 w-20 rounded-br-full border-b border-r border-white/65" />
          <div className="relative"><div className="text-xs font-semibold text-[color:var(--atlas-muted)]">尚無封面</div><div className="mt-1 text-sm font-extrabold text-[color:var(--atlas-ink)]">閱讀索引</div></div>
          {src ? <ImageOff className="relative h-5 w-5 text-[color:var(--atlas-danger)]" /> : <BookOpen className="relative h-5 w-5" />}
        </div>
      )}
    </div>
  );
}
