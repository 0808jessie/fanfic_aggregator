import React, { useState } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AgeConfirmationDialogProps = {
  open: boolean;
  onConfirm: (ageConfirmation: "adult" | "minor") => void;
};

export function AgeConfirmationDialog({ open, onConfirm }: AgeConfirmationDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md rounded-none border-2 border-[#111826] bg-[#fdfbf6] p-0 shadow-[10px_10px_0_#e27d9d]" aria-describedby={undefined} aria-label="年齡確認與內容分級提示" showCloseButton={false}>
        <div className="border-b border-[#111826]/15 bg-[#fff0f4] px-6 py-5">
          <div className="flex items-center gap-3 text-[#9b4358]"><ShieldAlert className="h-6 w-6" /><span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">Content rating notice</span></div>
          <DialogHeader className="mt-4 space-y-2 text-left"><DialogTitle className="text-2xl font-black tracking-[-0.05em]">年齡確認</DialogTitle><DialogDescription id="age-confirmation-description" className="text-sm leading-6 text-[#59656d]">本應用程式提供跨平台同人創作索引，部分原站作品可能標示為全年齡或限制級題材。你是否已年滿 18 歲？</DialogDescription></DialogHeader>
        </div>
        <div className="px-6 py-5"><p className="text-xs leading-5 text-[#69777f]">本程式不承載作品全文；點選後會前往原始平台，並遵循該平台本身的年齡規範。</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><Button type="button" variant="outline" onClick={() => onConfirm("minor")} className="h-auto min-h-12 rounded-none border-[#2d70d6] bg-[#e6efff] px-4 py-3 text-left text-[#245da9] hover:bg-[#dceaff]"><span className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em]">未滿 18 歲</span><span className="mt-1 block text-xs font-normal">啟用全年齡保護</span></Button><Button type="button" onClick={() => onConfirm("adult")} className="h-auto min-h-12 rounded-none bg-[#111826] px-4 py-3 text-left text-white hover:bg-[#24313a]"><span className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em]">已滿 18 歲</span><span className="mt-1 block text-xs font-normal text-white/75">可自行選擇分級模式</span></Button></div></div>
      </DialogContent>
    </Dialog>
  );
}

export function RestrictedSummary({ summary, shouldBlur }: { summary: string; shouldBlur: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const hidden = shouldBlur && !revealed;
  return <div className="relative mt-5"><p className={`line-clamp-3 text-sm leading-6 text-[#69777f] transition-[filter] duration-200 ${hidden ? "select-none blur-[5px]" : ""}`}>{summary || "No summary available."}</p>{hidden && <button type="button" onClick={() => setRevealed(true)} className="absolute inset-0 flex items-center justify-center gap-2 border border-[#efb4c4] bg-[#fff7f9]/80 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#9b4358] backdrop-blur-sm"><Eye className="h-3.5 w-3.5" />查看摘要</button>}{shouldBlur && !hidden && <button type="button" onClick={() => setRevealed(false)} className="mt-2 inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#9b4358] hover:underline"><EyeOff className="h-3 w-3" />重新模糊摘要</button>}</div>;
}
