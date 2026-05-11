/**
 * P1 — Sticky LIVE banner shown on the player's app home (Matches page)
 * whenever any tournament the user is registered in has is_live=true.
 *
 * - Queries tournament_players for current user
 * - Pulls those tournaments
 * - Subscribes to `tournaments` postgres_changes filtered by IDs
 * - Renders the lime banner per the design (auto-hidden when nothing live)
 *
 * Tapping deep-links into /tournaments/:id/live.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { XP, LiveDot } from './atoms';

interface LiveTournament {
  id: string;
  name: string;
  is_live: boolean;
  live_started_at: string | null;
  live_announcement: string | null;
}

interface NextMatchInfo {
  tournament_id: string;
  scheduled_at: string | null;
  round_number: number | null;
}

function formatCountdown(scheduledAt: string | null): string | null {
  if (!scheduledAt) return null;
  const ms = new Date(scheduledAt).getTime() - Date.now();
  if (ms <= 0) return 'NOW';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `IN ${totalMin}M`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `IN ${h}H` : `IN ${h}H ${m}M`;
}

export default function LiveTournamentBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<LiveTournament[]>([]);
  const [nextMatches, setNextMatches] = useState<Record<string, NextMatchInfo>>({});
  const [, setTick] = useState(0);

  /* Ticker so the countdown updates every minute */
  useEffect(() => {
    const i = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  /* Initial fetch + per-id realtime subscription */
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const fetchOnce = async () => {
      // 1. Find tournaments the user is a confirmed player in
      const { data: rosters } = await supabase
        .from('tournament_players')
        .select('tournament_id')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');

      const ids = Array.from(new Set((rosters ?? []).map((r: any) => r.tournament_id))).filter(Boolean);
      if (cancelled) return;

      if (ids.length === 0) {
        setTournaments([]);
        return;
      }

      // 2. Of those, which are live?
      const { data: tours } = await (supabase.from('tournaments') as any)
        .select('id, name, is_live, live_started_at, live_announcement')
        .in('id', ids)
        .eq('is_live', true);

      if (cancelled) return;
      setTournaments((tours ?? []) as LiveTournament[]);

      // 3. For each live tournament, find the user's next pending match
      if ((tours ?? []).length > 0) {
        const liveIds = (tours ?? []).map((t: any) => t.id);
        // Teams I'm on
        const { data: myTeams } = await supabase
          .from('tournament_teams')
          .select('id, tournament_id, player1_id, player2_id')
          .in('tournament_id', liveIds);
        const myTeamIds = (myTeams ?? []).filter((t: any) =>
          t.player1_id === user.id || t.player2_id === user.id
        ).map((t: any) => t.id);

        if (myTeamIds.length > 0) {
          const { data: pending } = await supabase
            .from('tournament_matches')
            .select('id, tournament_id, scheduled_at, round_number, team_a_id, team_b_id, status')
            .in('tournament_id', liveIds)
            .eq('status', 'pending')
            .order('scheduled_at', { ascending: true });

          const mine = (pending ?? []).filter((m: any) =>
            myTeamIds.includes(m.team_a_id) || myTeamIds.includes(m.team_b_id)
          );

          const byTournament: Record<string, NextMatchInfo> = {};
          for (const m of mine as any[]) {
            if (!byTournament[m.tournament_id]) {
              byTournament[m.tournament_id] = {
                tournament_id: m.tournament_id,
                scheduled_at:  m.scheduled_at,
                round_number:  m.round_number,
              };
            }
          }
          if (!cancelled) setNextMatches(byTournament);
        }
      } else {
        setNextMatches({});
      }
    };

    fetchOnce();

    // Subscribe to ANY change on tournaments — re-evaluate on every UPDATE.
    // Filtering by `is_live=eq.true` would miss the false→true transition.
    const channel = supabase
      .channel(`player-tournaments-${user.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tournaments' },
        () => { if (!cancelled) fetchOnce(); })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  /* Show only the first live tournament (rare to be in 2 at once) */
  const tournament = tournaments[0];
  const nextMatch = useMemo(() =>
    tournament ? nextMatches[tournament.id] : undefined,
  [tournament, nextMatches]);

  if (!tournament) return null;

  const countdownLabel = formatCountdown(nextMatch?.scheduled_at ?? null);

  return (
    <button
      onClick={() => navigate(`/tournaments/${tournament.id}/live`)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        margin: '8px 0 16px',
        padding: '14px 16px',
        borderRadius: 16,
        background: XP.lime,
        color: XP.navy,
        boxShadow: '0 10px 30px rgba(205,255,101,.35)',
        position: 'relative',
        overflow: 'hidden',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      {/* Big faded "LIVE" backdrop */}
      <span
        aria-hidden
        style={{
          position: 'absolute', right: -6, top: -22,
          fontFamily: "'Lexend', sans-serif",
          fontSize: 110, fontWeight: 900, fontStyle: 'italic',
          color: XP.navy, opacity: 0.06,
          lineHeight: 0.8, pointerEvents: 'none',
        }}
      >LIVE</span>

      {/* Pulsing dot well */}
      <span
        style={{
          position: 'relative',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: '50%',
          background: XP.navy,
          flexShrink: 0,
        }}
      >
        <LiveDot />
      </span>

      <span style={{ flex: 1, position: 'relative' }}>
        <span style={{
          display: 'block',
          fontFamily: "'Lexend', sans-serif", fontSize: 9.5, fontWeight: 900,
          letterSpacing: '.2em', textTransform: 'uppercase', opacity: 0.75,
        }}>
          Live · Tap to enter
        </span>
        <span style={{
          display: 'block',
          fontFamily: "'Lexend', sans-serif", fontSize: 16, fontWeight: 900,
          fontStyle: 'italic', textTransform: 'uppercase',
          letterSpacing: '-.01em', lineHeight: 1.05, marginTop: 2,
        }}>
          {tournament.name}
        </span>
        {(nextMatch && countdownLabel) && (
          <span style={{
            display: 'block',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11, fontWeight: 600, marginTop: 2,
            opacity: 0.7,
          }}>
            R{nextMatch.round_number ?? '?'} · YOUR NEXT MATCH {countdownLabel}
          </span>
        )}
        {(!nextMatch && tournament.live_announcement) && (
          <span style={{
            display: 'block',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11, fontWeight: 600, marginTop: 2,
            opacity: 0.7,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {tournament.live_announcement}
          </span>
        )}
      </span>

      <span style={{
        fontFamily: "'Lexend', sans-serif", fontSize: 22,
        fontWeight: 900, fontStyle: 'italic',
        flexShrink: 0,
      }}>›</span>
    </button>
  );
}
