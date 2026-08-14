import { ImageOff, Layers3 } from "lucide-react";
import React, { useState } from "react";

type BlueprintCoverProps = {
  src?: string | null;
  title: string;
  className?: string;
};

/**
 * A defensive cover renderer for third-party image hosts. The image remains a
 * browser-native lazy request; if a host rejects it, the card keeps its layout
 * and switches to an intentional Blueprint fallback instead of a broken icon.
 */
export function BlueprintCover({ src, title, className = "h-44" }: BlueprintCoverProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={`relative overflow-hidden border-b border-[#10151b]/10 bg-[#eef3f1] ${className}`}>
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
        <div role="img" aria-label={`${title} 的 Blueprint 預設封面`} className="relative flex h-full w-full items-end justify-between overflow-hidden p-4 text-[#2d70d6]">
          <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(45,112,214,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(45,112,214,0.14)_1px,transparent_1px)] [background-size:20px_20px]" />
          <div className="relative"><div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]">COVER / UNAVAILABLE</div><div className="mt-1 text-sm font-black tracking-[-0.04em] text-[#111826]">ATLAS INDEX COVER</div></div>
          {src ? <ImageOff className="relative h-5 w-5 text-[#e76f51]" /> : <Layers3 className="relative h-5 w-5" />}
        </div>
      )}
    </div>
  );
}
