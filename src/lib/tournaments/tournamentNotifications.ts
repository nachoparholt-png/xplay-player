import { supabase } from "@/integrations/supabase/client";

/**
 * Send tournament notifications using the create_notification_for_user RPC.
 */

export async function notifyTournamentLaunched(
  tournamentId: string,
  tournamentName: string,
  playerUserIds: string[],
  creatorId: string
) {
  const promises = playerUserIds
    .filter((uid) => uid !== creatorId)
    .map((uid) =>
      supabase.rpc("create_notification_for_user", {
        _user_id: uid,
        _type: "tournament",
        _title: "Tournament Started! 🏆",
        _body: `${tournamentName} is now live. Head over to see the bracket!`,
        _link: `/tournaments/${tournamentId}/live`,
      })
    );
  await Promise.allSettled(promises);
}

export async function notifyUpNext(
  tournamentId: string,
  tournamentName: string,
  playerUserIds: string[],
  matchNumber: number
) {
  const promises = playerUserIds.map((uid) =>
    supabase.rpc("create_notification_for_user", {
      _user_id: uid,
      _type: "tournament",
      _title: "You're up next! 🎾",
      _body: `Match #${matchNumber} in ${tournamentName} is coming up.`,
      _link: `/tournaments/${tournamentId}/live`,
    })
  );
  await Promise.allSettled(promises);
}

export async function notifyResultEntered(
  tournamentId: string,
  tournamentName: string,
  playerUserIds: string[],
  matchNumber: number,
  submitterId: string
) {
  const promises = playerUserIds
    .filter((uid) => uid !== submitterId)
    .map((uid) =>
      supabase.rpc("create_notification_for_user", {
        _user_id: uid,
        _type: "tournament",
        _title: "Score submitted 📝",
        _body: `Match #${matchNumber} result has been entered in ${tournamentName}.`,
        _link: `/tournaments/${tournamentId}/live`,
      })
    );
  await Promise.allSettled(promises);
}

export async function notifyTournamentCompleted(
  tournamentId: string,
  tournamentName: string,
  playerUserIds: string[]
) {
  const promises = playerUserIds.map((uid) =>
    supabase.rpc("create_notification_for_user", {
      _user_id: uid,
      _type: "tournament",
      _title: "Tournament Complete! 🎉",
      _body: `${tournamentName} has finished. Check the final standings!`,
      _link: `/tournaments/${tournamentId}`,
    })
  );
  await Promise.allSettled(promises);
}

export async function notifyFormatAdjusted(
  tournamentId: string,
  tournamentName: string,
  playerUserIds: string[],
  adjustmentDescription: string,
  creatorId: string
) {
  const promises = playerUserIds
    .filter((uid) => uid !== creatorId)
    .map((uid) =>
      supabase.rpc("create_notification_for_user", {
        _user_id: uid,
        _type: "tournament",
        _title: "Format adjusted ⚙️",
        _body: `${tournamentName}: ${adjustmentDescription}`,
        _link: `/tournaments/${tournamentId}/live`,
      })
    );
  await Promise.allSettled(promises);
}

export async function notifyPlayerWithdrawal(
  tournamentId: string,
  tournamentName: string,
  playerUserIds: string[],
  withdrawnPlayerName: string,
  replacedByName?: string
) {
  const body = replacedByName
    ? `${withdrawnPlayerName} has withdrawn from ${tournamentName}. ${replacedByName} has stepped in as replacement.`
    : `${withdrawnPlayerName} has withdrawn from ${tournamentName}. Walkovers have been applied to their remaining matches.`;

  const promises = playerUserIds.map((uid) =>
    supabase.rpc("create_notification_for_user", {
      _user_id: uid,
      _type: "tournament",
      _title: "Player withdrawal ⚠️",
      _body: body,
      _link: `/tournaments/${tournamentId}/live`,
    })
  );
  await Promise.allSettled(promises);
}
