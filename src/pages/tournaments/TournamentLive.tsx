/**
 * Tournament Live Mode — Player iOS page (P2–P5 layout)
 *
 * Replaces the prior live page with the tabbed layout from the Claude Design
 * handoff. Fetches tournament + matches + teams + profiles + help requests,
 * subscribes to `tournament-live-${id}` postgres_changes for realtime, and
 * coordinates the Help, Opponent-Stats, and Score-Upload sheets.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import TournHeader from '@/components/tournaments/live/TournHeader';
import TournTabs, { type LiveTabId } from '@/components/tournaments/live/TournTabs';
import MyMatchTab from '@/components/tournaments/live/MyMatchTab';
import ScheduleTab from '@/components/tournaments/live/ScheduleTab';
import BracketTab from '@/components/tournaments/live/BracketTab';
import StatsTab from '@/components/tournaments/live/StatsTab';
import HelpNeededSheet from '@/components/tournaments/live/HelpNeededSheet';
import ScoreUploadSheet from '@/components/tournaments/live/ScoreUploadSheet';
import OpponentStatsSheet from '@/components/tournaments/live/OpponentStatsSheet';
import { XP } from '@/components/tournaments/live/atoms';
import type {
  TournamentRow, TMatchRow, TTeamRow, ProfileLite, HelpRequestRow,
} from '@/components/tournaments/live/types';

export default function TournamentLive() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [matches,    setMatches]    = useState<TMatchRow[]>([]);
  const [teams,      setTeams]      = useState<TTeamRow[]>([]);
  const [profiles,   setProfiles]   = useState<ProfileLite[]>([]);
  const [helps,      setHelps]      = useState<HelpRequestRow[]>([]);
  const [loading,    setLoading]    = useState(true);

  const [tab, setTab] = useState<LiveTabId>('match');

  /* Sheets */
  const [helpMatch,    setHelpMatch]    = useState<TMatchRow | null>(null);
  const [scoreMatch,   setScoreMatch]   = useState<TMatchRow | null>(null);
  const [opponentInfo, setOpponentInfo] = useState<{ id: string; name: string } | null>(null);

  /* ─── Initial fetch + realtime ─────────────────────────────── */
  const reload = async () => {
    if (!id) return;
    const [tRes, mRes, teamsRes, helpsRes] = await Promise.all([
      (supabase.from('tournaments') as any)
        .select('id, name, status, is_live, live_started_at, live_ended_at, live_announcement, started_at, completed_at, format_type, tournament_type, player_count, court_count, court_labels, match_config, bracket_config, created_by, club, club_id')
        .eq('id', id)
        .maybeSingle(),
      (supabase.from('tournament_matches') as any)
        .select('id, tournament_id, match_number, round_number, round_type, team_a_id, team_b_id, status, result, court_number, court_label, scheduled_at, started_at, completed_at, estimated_mins')
        .eq('tournament_id', id)
        .order('round_number', { ascending: true })
        .order('match_number', { ascending: true }),
      (supabase.from('tournament_teams') as any)
        .select('id, tournament_id, team_name, player1_id, player2_id, group_id')
        .eq('tournament_id', id),
      (supabase as any).from('tournament_help_requests')
        .select('*')
        .eq('tournament_id', id)
        .order('created_at', { ascending: false }),
    ]);

    setTournament((tRes.data ?? null) as TournamentRow | null);
    const mRows  = (mRes.data ?? []) as TMatchRow[];
    const tmRows = (teamsRes.data ?? []) as TTeamRow[];
    setMatches(mRows);
    setTeams(tmRows);
    setHelps((helpsRes.data ?? []) as HelpRequestRow[]);

    /* Profiles for everyone on a team in this tournament */
    const ids = Array.from(new Set(
      tmRows.flatMap(t => [t.player1_id, t.player2_id]).filter(Boolean) as string[]
    ));
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', ids);
      setProfiles((profs ?? []) as ProfileLite[]);
    } else {
      setProfiles([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* Realtime — refetch on any change to matches / help / tournament */
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`tournament-live-${id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${id}` },
        () => reload())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_help_requests', filter: `tournament_id=eq.${id}` },
        () => reload())
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${id}` },
        () => reload())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ─── Derived view-model ───────────────────────────────────── */
  const teamsById    = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);
  const profilesById = useMemo(() => new Map(profiles.map(p => [p.user_id, p])), [profiles]);

  const matchesTotal = matches.length;
  const matchesDone  = matches.filter(m => m.status === 'completed').length;
  const totalRounds  = matchesTotal === 0 ? 0 : Math.max(...matches.map(m => m.round_number ?? 1));
  const currentRound = matchesTotal === 0
    ? 0
    : matches.find(m => m.status === 'in_progress')?.round_number
      ?? matches.find(m => m.status === 'pending')?.round_number
      ?? totalRounds;

  const meUserId = user?.id ?? '';

  /* My open help request (so MyMatchTab can show the pill) */
  const myOpenHelp = useMemo(() => {
    return helps.find(h =>
      h.requested_by === meUserId &&
      (h.status === 'open' || h.status === 'acknowledged')
    ) ?? null;
  }, [helps, meUserId]);

  /* ─── Renderers ─────────────────────────────────────────────── */
  const renderTab = () => {
    switch (tab) {
      case 'match':
        return (
          <MyMatchTab
            meUserId={meUserId}
            matches={matches}
            teamsById={teamsById}
            profilesById={profilesById}
            myOpenHelp={myOpenHelp}
            onUploadScore={(m) => setScoreMatch(m)}
            onTapOpponent={(uid) => {
              const p = profilesById.get(uid);
              setOpponentInfo({ id: uid, name: p?.display_name ?? 'Player' });
            }}
            onHelpNeeded={(m) => setHelpMatch(m)}
          />
        );
      case 'schedule':
        return (
          <ScheduleTab
            meUserId={meUserId}
            matches={matches}
            teamsById={teamsById}
            profilesById={profilesById}
          />
        );
      case 'bracket':
        return (
          <BracketTab
            meUserId={meUserId}
            matches={matches}
            teamsById={teamsById}
            profilesById={profilesById}
          />
        );
      case 'stats':
        return (
          <StatsTab
            meUserId={meUserId}
            matches={matches}
            teamsById={teamsById}
            profilesById={profilesById}
          />
        );
    }
  };

  /* ─── Loading / not-found ──────────────────────────────────── */
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: XP.navyDeep, color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 32, height: 32, border: `3px solid ${XP.lime}`,
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{
        minHeight: '100vh', background: XP.navyDeep, color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, padding: 24,
      }}>
        <p style={{
          fontFamily: "'Lexend', sans-serif", fontWeight: 800, fontStyle: 'italic',
          textTransform: 'uppercase', fontSize: 18, textAlign: 'center',
        }}>Tournament not found</p>
        <button
          onClick={() => navigate('/tournaments')}
          style={{
            padding: '10px 18px', borderRadius: 12, border: 'none',
            background: XP.lime, color: XP.navy, cursor: 'pointer',
            fontFamily: "'Lexend', sans-serif", fontWeight: 800, fontStyle: 'italic',
            textTransform: 'uppercase', fontSize: 12,
          }}>Back</button>
      </div>
    );
  }

  /* ─── Pre-live waiting state ──────────────────────────────────
     Tournament is published but the organiser hasn't pressed Go Live yet,
     so is_live is still false. Don't show the Live tabs (they would imply
     it's already running) — show a clear waiting state instead.            */
  const isActuallyLive   = tournament.is_live === true;
  const isCompleted      = tournament.status === 'completed' || !!tournament.completed_at;
  const showWaitingState = !isActuallyLive && !isCompleted;

  if (showWaitingState) {
    const scheduledAt =
      tournament.started_at ??
      (tournament as TournamentRow & { scheduled_date?: string | null; scheduled_time?: string | null }).scheduled_date ??
      null;
    return (
      <div style={{
        minHeight: '100vh', background: XP.navyDeep, color: 'white',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          style={{
            position: 'fixed', top: 'max(14px, env(safe-area-inset-top))', left: 12, zIndex: 30,
            width: 36, height: 36, borderRadius: 18,
            background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.1)',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
          <ArrowLeft size={18} />
        </button>

        <TournHeader
          tournamentName={tournament.name}
          organizerLabel={tournament.club ?? undefined}
          totalRounds={totalRounds}
          currentRound={currentRound}
          matchesDone={matchesDone}
          matchesTotal={matchesTotal}
          liveStartedAt={tournament.live_started_at}
          state="waiting"
        />

        <div style={{
          flex: 1, padding: '24px 18px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        }}>
          <div style={{
            maxWidth: 420, width: '100%',
            background: 'rgba(255,255,255,.04)',
            borderRadius: 20, padding: 24,
            border: '1px solid rgba(255,255,255,.06)',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: "'Lexend', sans-serif", fontSize: 14, fontWeight: 800, fontStyle: 'italic',
              textTransform: 'uppercase', letterSpacing: '.08em',
              marginBottom: 8,
            }}>Not yet live</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.5 }}>
              {matchesTotal === 0
                ? 'The bracket has not been generated yet. The organiser will publish it when ready.'
                : 'Waiting for the organiser to start the tournament.'}
            </div>
            {scheduledAt && (
              <div style={{
                marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,.5)',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}>
                Scheduled · {new Date(scheduledAt).toLocaleString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </div>
            )}
            <button
              onClick={() => navigate(`/tournaments/${tournament.id}`)}
              style={{
                marginTop: 18,
                padding: '10px 18px', borderRadius: 12, border: 'none',
                background: XP.lime, color: XP.navy, cursor: 'pointer',
                fontFamily: "'Lexend', sans-serif", fontWeight: 800, fontStyle: 'italic',
                textTransform: 'uppercase', fontSize: 11, letterSpacing: '.08em',
              }}>
              View tournament details
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Page ─────────────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh',
      background: XP.navyDeep,
      color: 'white',
      display: 'flex', flexDirection: 'column',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* Back button — sits over the header safe area */}
      <button
        onClick={() => navigate(-1)}
        aria-label="Back"
        style={{
          position: 'fixed', top: 'max(14px, env(safe-area-inset-top))', left: 12, zIndex: 30,
          width: 36, height: 36, borderRadius: 18,
          background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.1)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
        <ArrowLeft size={18} />
      </button>

      <TournHeader
        tournamentName={tournament.name}
        organizerLabel={tournament.club ?? undefined}
        totalRounds={totalRounds}
        currentRound={currentRound}
        matchesDone={matchesDone}
        matchesTotal={matchesTotal}
        liveStartedAt={tournament.live_started_at}
        state={isCompleted ? 'ended' : 'live'}
      />
      <TournTabs active={tab} onChange={setTab} />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: XP.navyDeep, overflow: 'hidden',
      }}>
        {renderTab()}
      </div>

      {/* Sheets */}
      {helpMatch && meUserId && (
        <HelpNeededSheet
          tournamentId={tournament.id}
          match={helpMatch}
          meUserId={meUserId}
          onClose={() => setHelpMatch(null)}
          onSent={() => { /* realtime will refresh helps; pill shows up automatically */ }}
        />
      )}
      {scoreMatch && (
        <ScoreUploadSheet
          match={scoreMatch}
          teamsById={teamsById}
          profilesById={profilesById}
          meUserId={meUserId}
          onClose={() => setScoreMatch(null)}
          onSaved={() => { setScoreMatch(null); reload(); }}
        />
      )}
      {opponentInfo && meUserId && (
        <OpponentStatsSheet
          opponentUserId={opponentInfo.id}
          opponentName={opponentInfo.name}
          meUserId={meUserId}
          onClose={() => setOpponentInfo(null)}
        />
      )}
    </div>
  );
}
