import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook for match group chat and direct chat operations.
 *
 * Since 24 Sep 2026 every write goes through server functions
 * (migration 20260924100000_chat_privacy_and_tournament_join_guards.sql):
 * the database no longer lets the app add people to a conversation directly,
 * because that allowed anyone to join (and read) any chat.
 *   open_match_chat(match_id, title)      – create/open; adds every confirmed player
 *   leave_match_chat(match_id, user, why) – left / removed / cancelled + system line
 *   post_match_system_message(match_id, text)
 *   open_direct_chat(other_user_id)       – 1:1 chat, created once and reused
 */
// RPC names are not in the generated types yet
const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args);

export const useMatchChat = () => {
  const { user } = useAuth();

  /** Get or create a match group chat, ensuring the current user is a participant */
  const getOrCreateMatchChat = useCallback(
    async (matchId: string, matchTitle: string) => {
      if (!user) return null;
      const { data, error } = await rpc("open_match_chat", { _match_id: matchId, _title: matchTitle });
      if (error) {
        console.warn("[chat] open_match_chat failed", error.message);
        return null;
      }
      return (data as string) ?? null;
    },
    [user]
  );

  /** Add the current player to a match chat (posts "X joined the match") */
  const addPlayerToMatchChat = useCallback(
    async (matchId: string, _userId?: string) => {
      const { error } = await rpc("open_match_chat", { _match_id: matchId, _title: null });
      if (error) console.warn("[chat] join match chat failed", error.message);
    },
    []
  );

  /** Remove a player from a match chat with a system message */
  const removePlayerFromMatchChat = useCallback(
    async (matchId: string, userId: string, reason: "left" | "removed" | "cancelled" = "left") => {
      const { error } = await rpc("leave_match_chat", { _match_id: matchId, _user_id: userId, _reason: reason });
      if (error) console.warn("[chat] leave match chat failed", error.message);
    },
    []
  );

  /** Send a system message to a match chat */
  const addSystemMessage = useCallback(
    async (matchId: string, text: string) => {
      const { error } = await rpc("post_match_system_message", { _match_id: matchId, _text: text });
      if (error) console.warn("[chat] system message failed", error.message);
    },
    []
  );

  /** Get or create a direct chat between current user and another user (gated by contact status unless skipContactCheck) */
  const getOrCreateDirectChat = useCallback(
    async (otherUserId: string, skipContactCheck = false) => {
      if (!user) return null;

      if (!skipContactCheck) {
        const { data: contactCheck } = await supabase
          .from("contact_requests")
          .select("id")
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
          .eq("status", "accepted")
          .maybeSingle();

        if (!contactCheck) {
          return null;
        }
      }

      const { data, error } = await rpc("open_direct_chat", { _other_user_id: otherUserId });
      if (error) {
        console.warn("[chat] open_direct_chat failed", error.message);
        return null;
      }
      return (data as string) ?? null;
    },
    [user]
  );

  return {
    getOrCreateMatchChat,
    getOrCreateDirectChat,
    addPlayerToMatchChat,
    removePlayerFromMatchChat,
    addSystemMessage,
  };
};
