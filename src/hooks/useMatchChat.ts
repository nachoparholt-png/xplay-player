import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook for match group chat and direct chat operations.
 * Handles creation, participant management, and system messages.
 */
export const useMatchChat = () => {
  const { user } = useAuth();

  /** Get or create a match group chat, ensuring the current user is a participant */
  const getOrCreateMatchChat = useCallback(
    async (matchId: string, matchTitle: string) => {
      if (!user) return null;

      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("match_id", matchId)
        .maybeSingle();

      if (existing) {
        await ensureParticipant(existing.id, user.id);
        return existing.id;
      }

      // Create new match conversation
      const convId = crypto.randomUUID();
      const { error } = await supabase
        .from("conversations")
        .insert({ id: convId, type: "match", match_id: matchId, title: matchTitle });

      if (error) return null;
      const conv = { id: convId };

      // Add current user first
      await supabase.from("conversation_participants").insert({
        conversation_id: conv.id,
        user_id: user.id,
      });

      // Add all other confirmed players
      const { data: players } = await supabase
        .from("match_players")
        .select("user_id")
        .eq("match_id", matchId)
        .eq("status", "confirmed");

      if (players && players.length > 0) {
        const others = players.filter((p) => p.user_id !== user.id);
        if (others.length > 0) {
          await supabase.from("conversation_participants").insert(
            others.map((p) => ({ conversation_id: conv.id, user_id: p.user_id }))
          );
        }
      }

      // Get creator name for system message
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();

      const creatorName = profile?.display_name || "Someone";

      // System messages
      await supabase.from("messages").insert([
        {
          conversation_id: conv.id,
          message_text: "Match chat created 🎾",
          message_type: "system_message",
        },
        {
          conversation_id: conv.id,
          message_text: `${creatorName} created this match`,
          message_type: "system_message",
        },
      ]);

      return conv.id;
    },
    [user]
  );

  /** Add a player to a match chat with a system message */
  const addPlayerToMatchChat = useCallback(
    async (matchId: string, userId: string) => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("match_id", matchId)
        .maybeSingle();

      if (!conv) return;

      const added = await ensureParticipant(conv.id, userId);
      if (!added) return; // Already a participant

      // Get player name for system message
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .single();

      await supabase.from("messages").insert({
        conversation_id: conv.id,
        message_text: `${profile?.display_name || "A player"} joined the match`,
        message_type: "system_message",
      });
    },
    []
  );

  /** Remove a player from a match chat with a system message */
  const removePlayerFromMatchChat = useCallback(
    async (matchId: string, userId: string, reason: "left" | "removed" | "cancelled" = "left") => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("match_id", matchId)
        .maybeSingle();

      if (!conv) return;

      // Mark as left
      await supabase
        .from("conversation_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("conversation_id", conv.id)
        .eq("user_id", userId)
        .is("left_at", null);

      // Get player name
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .single();

      const name = profile?.display_name || "A player";
      const actionText =
        reason === "removed" ? `${name} was removed from the match` :
        reason === "cancelled" ? `${name} cancelled their registration` :
        `${name} left the match`;

      await supabase.from("messages").insert({
        conversation_id: conv.id,
        message_text: actionText,
        message_type: "system_message",
      });
    },
    []
  );

  /** Send a system message to a match chat */
  const addSystemMessage = useCallback(
    async (matchId: string, text: string) => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("match_id", matchId)
        .maybeSingle();

      if (!conv) return;

      await supabase.from("messages").insert({
        conversation_id: conv.id,
        message_text: text,
        message_type: "system_message",
      });
    },
    []
  );

  /** Get or create a direct chat between current user and another user (gated by contact status unless skipContactCheck) */
  const getOrCreateDirectChat = useCallback(
    async (otherUserId: string, skipContactCheck = false) => {
      if (!user) return null;

      if (!skipContactCheck) {
        // Check if users are contacts
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

      const { data: myConvs } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id)
        .is("left_at", null);

      if (myConvs && myConvs.length > 0) {
        const convIds = myConvs.map((c) => c.conversation_id);
        const { data: directConvs } = await supabase
          .from("conversations")
          .select("id")
          .in("id", convIds)
          .eq("type", "direct");

        if (directConvs) {
          for (const dc of directConvs) {
            const { data: participants } = await supabase
              .from("conversation_participants")
              .select("user_id")
              .eq("conversation_id", dc.id)
              .is("left_at", null);

            const userIds = participants?.map((p) => p.user_id) || [];
            if (userIds.includes(otherUserId) && userIds.includes(user.id)) {
              return dc.id;
            }
          }
        }
      }

      // Generate ID client-side to avoid SELECT policy conflict on new conversation
      const convId = crypto.randomUUID();
      const { error } = await supabase
        .from("conversations")
        .insert({ id: convId, type: "direct" });

      if (error) return null;

      // Insert self first so is_conversation_member passes for adding the other user
      await supabase.from("conversation_participants").insert({
        conversation_id: convId, user_id: user.id,
      });
      await supabase.from("conversation_participants").insert({
        conversation_id: convId, user_id: otherUserId,
      });

      return convId;
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

/**
 * Ensure a user is a participant in a conversation.
 * Returns true if the user was newly added (or rejoined), false if already active.
 */
async function ensureParticipant(conversationId: string, userId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from("conversation_participants")
    .select("id, left_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("conversation_participants").insert({
      conversation_id: conversationId,
      user_id: userId,
    });
    return true;
  } else if (existing.left_at) {
    await supabase
      .from("conversation_participants")
      .update({ left_at: null })
      .eq("id", existing.id);
    return true;
  }
  return false;
}
