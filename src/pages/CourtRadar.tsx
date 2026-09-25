/** Court Radar — free courts anywhere (the Courts finder on its own page, from Home). */
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import CourtFinder from "@/components/courts/CourtFinder";

const CourtRadar = () => {
  const navigate = useNavigate();
  return (
    <div className="px-4 pt-3 pb-28 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label="Back" className="p-2 -ml-2 rounded-xl text-muted-foreground active:scale-95">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="font-display text-[22px] font-black italic uppercase leading-none">Court Radar</h1>
      </div>
      <CourtFinder />
    </div>
  );
};

export default CourtRadar;
