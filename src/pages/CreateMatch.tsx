/**
 * /matches/create — the Clubs page ("Organise a match here") and the Courts tab land
 * here with `state.prefillClubId`. Since the 25 Sep 2026 redesign there is ONE create
 * flow, the 3-step CreateMatchModal; this route just opens it with what it was given
 * and goes back when it closes.
 */
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import CreateMatchModal, { type CreateMatchInitial } from "@/components/CreateMatchModal";

const CreateMatch = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as { prefillClubId?: string; slot?: CreateMatchInitial["slot"]; courtBooked?: boolean } | null) ?? null;
  const [open, setOpen] = useState(true);
  const initial: CreateMatchInitial | null = state?.prefillClubId
    ? { clubId: state.prefillClubId, slot: state.slot ?? null, courtBooked: state.courtBooked }
    : null;

  return (
    <div className="min-h-[60dvh]">
      <CreateMatchModal
        open={open}
        initial={initial}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) navigate(-1);
        }}
        onCreated={(matchId) => navigate(`/matches/${matchId}`, { replace: true })}
      />
    </div>
  );
};

export default CreateMatch;
