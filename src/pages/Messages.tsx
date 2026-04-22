import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageSquare, Users, Search, UserPlus, Calendar, Clock, MapPin, Check, X } from "lucide-react";
import { IconMatches } from "@/components/icons/XPlayIcons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMatchChat } from "@/hooks/useMatchChat";
import { format, isToday, isYesterday } from "date-fns";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type ConversationPreview = {
  id: string;
  type: string;
  title: string | null;
  match_id: string | null;
  other_user_id: string | null;
  other_user_name: string | null;
  other_user_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number;
  match_club?: string;
  match_date?: string;
  match_time?: string;
  match_player_count?: number;
};

type PlayerProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  padel_level: number | null;
  padel_park_points: number;
  preferred_side: string | null;
  preferred_club: string | null;
  location: string | null;
};

type ContactRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
};

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
};

const Messages = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { getOrCreateDirectChat } = useMatchChat();
  const [tab, setTab] = useState<"players" | "contacts" | "matches">("matches");
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [startingChat, setStartingChat] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [unreadByContact, setUnreadByContact] = useState<Map<string, number>>(new Map());

  const fetchPlayers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url, padel_level, padel_park_points, preferred_side, preferred_club, location")
      .neq("user_id", user.id)
      .eq("account_status", "active")
      .order("padel_level", { ascending: false, nullsFirst: false });
    setPlayers(data || []);
  };

  const fetchContactRequests = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("contact_requests")
      .select("id, sender_id, receiver_id, status")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
    setContactRequests((data as ContactRequest[]) || []);
  };

  const fetchConversations = async () => {
    if (!user) return;
    setLoading(true);

    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id)
      .is("left_at", null);

    if (!participations || participations.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convIds = participations.map((p) => p.conversation_id);

    const { data: convs } = await supabase
      .from("conversations")
      .select("*, conversation_participants(user_id, left_at)")
      .in("id", convIds);

    if (!convs) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const previews: ConversationPreview[] = [];

    // Fetch all last messages in a single RPC call (replaces N+1 loop)
    const { data: lastMessages } = await supabase.rpc("get_last_messages", { conv_ids: convIds });
    const lastMsgMap = new Map<string, { message_text: string | null; created_at: string; sender_id: string | null }>(
      (lastMessages || []).map((m: any) => [m.conversation_id, m])
    );

    const matchIds = convs.filter((c) => c.match_id).map((c) => c.match_id!);
    let matchMap = new Map<string, { club: string; match_date: string; match_time: string }>();
    if (matchIds.length > 0) {
      const { data: matches } = await supabase
        .from("matches")
        .select("id, club, match_date, match_time")
        .in("id", matchIds);
      matches?.forEach((m) => matchMap.set(m.id, { club: m.club, match_date: m.match_date, match_time: m.match_time }));
    }

    for (const conv of convs) {
      const lastMsg = lastMsgMap.get(conv.id) || null;

      let otherUserId: string | null = null;

      const activeParticipants = ((conv.conversation_participants as Array<{ user_id: string; left_at: string | null }>) || [])
        .filter((p) => p.left_at === null);

      if (conv.type === "direct") {
        const others = activeParticipants.filter((p) => p.user_id !== user.id);
        if (others.length > 0) otherUserId = others[0].user_id;
      }

      const participantCount = activeParticipants.length;

      const matchInfo = conv.match_id ? matchMap.get(conv.match_id) : undefined;

      previews.push({
        id: conv.id,
        type: conv.type,
        title: conv.title,
        match_id: conv.match_id,
        other_user_id: otherUserId,
        other_user_name: null,
        other_user_avatar: null,
        last_message: lastMsg?.message_text || null,
        last_message_at: lastMsg?.created_at || conv.created_at,
        last_sender_id: lastMsg?.sender_id || null,
        unread_count: 0,
        match_club: matchInfo?.club,
        match_date: matchInfo?.match_date,
        match_time: matchInfo?.match_time,
        match_player_count: participantCount,
      });
    }

    const userIdsToFetch = previews
      .filter((p) => p.type === "direct" && p.other_user_id)
      .map((p) => p.other_user_id!);

    if (userIdsToFetch.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIdsToFetch);

      if (profiles) {
        previews.forEach((p) => {
          if (p.other_user_id) {
            const prof = profiles.find((pr) => pr.user_id === p.other_user_id);
            if (prof) {
              p.other_user_name = prof.display_name;
              p.other_user_avatar = prof.avatar_url;
            }
          }
        });
      }
    }

    previews.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

    setConversations(previews);
    setLoading(false);
  };

  const fetchUnreadCounts = async () => {
    if (!user) return;

    // Get all direct conversations user participates in
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .eq("user_id", user.id)
      .is("left_at", null);

    if (!participations || participations.length === 0) return;

    const convIds = participations.map((p) => p.conversation_id);

    // Only direct conversations
    const { data: directConvs } = await supabase
      .from("conversations")
      .select("id")
      .in("id", convIds)
      .eq("type", "direct");

    if (!directConvs || directConvs.length === 0) return;

    const directConvIds = directConvs.map((c) => c.id);

    // Get all messages not sent by me in these conversations
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id")
      .in("conversation_id", directConvIds)
      .neq("sender_id", user.id)
      .eq("message_type", "user_message");

    if (!msgs || msgs.length === 0) {
      setUnreadByContact(new Map());
      return;
    }

    // Get my reads
    const msgIds = msgs.map((m) => m.id);
    const { data: reads } = await supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", user.id)
      .in("message_id", msgIds);

    const readSet = new Set(reads?.map((r) => r.message_id) || []);
    const unreadMsgs = msgs.filter((m) => !readSet.has(m.id));

    // Get participants to map conversation → other user
    const { data: allParts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", directConvIds)
      .is("left_at", null);

    const convToOther = new Map<string, string>();
    allParts?.forEach((p) => {
      if (p.user_id !== user.id) convToOther.set(p.conversation_id, p.user_id);
    });

    // Count unread per contact
    const counts = new Map<string, number>();
    unreadMsgs.forEach((m) => {
      const otherId = convToOther.get(m.conversation_id);
      if (otherId) counts.set(otherId, (counts.get(otherId) || 0) + 1);
    });

    setUnreadByContact(counts);
  };

  useEffect(() => {
    if (user) {
      fetchPlayers();
      fetchContactRequests();
      fetchConversations();
      fetchUnreadCounts();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("messages-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        fetchConversations();
        fetchUnreadCounts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Helper to get contact status for a player
  const getContactStatus = (playerId: string): { status: "none" | "pending_sent" | "pending_received" | "accepted" | "rejected"; requestId?: string } => {
    const sent = contactRequests.find((r) => r.sender_id === user?.id && r.receiver_id === playerId);
    if (sent) {
      if (sent.status === "accepted") return { status: "accepted", requestId: sent.id };
      if (sent.status === "pending") return { status: "pending_sent", requestId: sent.id };
      return { status: "none" }; // rejected → can re-send
    }
    const received = contactRequests.find((r) => r.sender_id === playerId && r.receiver_id === user?.id);
    if (received) {
      if (received.status === "accepted") return { status: "accepted", requestId: received.id };
      if (received.status === "pending") return { status: "pending_received", requestId: received.id };
      return { status: "none" };
    }
    return { status: "none" };
  };

  const handleSendRequest = async (playerId: string) => {
    if (!user) return;
    setSendingRequest(playerId);
    
    // Delete any previous rejected request first
    const existing = contactRequests.find(
      (r) => r.sender_id === user.id && r.receiver_id === playerId && r.status === "rejected"
    );
    if (existing) {
      // We can't delete due to no DELETE policy, so we'll just insert a new one
      // Actually the UNIQUE constraint means we need to handle this. Let's use upsert-like approach.
    }

    const { error } = await supabase.from("contact_requests").insert({
      sender_id: user.id,
      receiver_id: playerId,
      status: "pending",
    });

    if (error) {
      // If duplicate, it might be a rejected one. Since we can't update as sender, just show error
      if (error.code === "23505") {
        toast.error("Request already exists");
      } else {
        toast.error("Failed to send request");
      }
      setSendingRequest(null);
      return;
    }

    // Send notification to receiver
    const senderName = profile?.display_name || "Someone";
    await supabase.rpc("create_notification_for_user", {
      _user_id: playerId,
      _type: "contact_request",
      _title: "Contact Request",
      _body: `${senderName} wants to add you as a contact.`,
      _link: null,
    });

    toast.success("Contact request sent!");
    await fetchContactRequests();
    setSendingRequest(null);
  };

  const handleRespondRequest = async (requestId: string, action: "accepted" | "rejected") => {
    await supabase
      .from("contact_requests")
      .update({ status: action, responded_at: new Date().toISOString() })
      .eq("id", requestId);

    toast.success(action === "accepted" ? "Contact added!" : "Request declined");
    await fetchContactRequests();
  };

  const handleStartChat = async (playerId: string) => {
    setStartingChat(playerId);
    const convId = await getOrCreateDirectChat(playerId);
    setStartingChat(null);
    if (convId) navigate(`/messages/${convId}`);
  };

  const filteredPlayers = players.filter((p) =>
    !searchQuery || (p.display_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.location || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.preferred_club || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Contacts = players with accepted requests
  const acceptedContactIds = contactRequests
    .filter((r) => r.status === "accepted")
    .map((r) => (r.sender_id === user?.id ? r.receiver_id : r.sender_id));

  const contactPlayers = players.filter((p) => acceptedContactIds.includes(p.user_id));

  const matchConvs = conversations.filter((c) => c.type === "match");

  const tabs = [
    { key: "matches" as const, label: "Match Chats", icon: IconMatches },
    { key: "contacts" as const, label: "Contacts", icon: MessageSquare },
    { key: "players" as const, label: "Players", icon: Users },
  ];

  const renderPlayerRow = (player: PlayerProfile, showContactAction: boolean) => {
    const initial = (player.display_name || "?")?.[0]?.toUpperCase();
    const sideMap: Record<string, string> = { left: "Left Side", right: "Right Side", both: "Both Sides" };
    const side = player.preferred_side ? sideMap[player.preferred_side.toLowerCase()] || player.preferred_side : null;
    const sideCls = player.preferred_side?.toLowerCase() === "left"
      ? "bg-secondary/15 text-secondary"
      : player.preferred_side?.toLowerCase() === "right"
        ? "bg-primary/15 text-primary"
        : "bg-muted text-muted-foreground";

    const contactStatus = getContactStatus(player.user_id);

    return (
      <motion.div
        key={player.user_id}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-elevated p-3.5 flex items-center gap-3"
      >
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full shrink-0 overflow-hidden">
          {player.avatar_url ? (
            <img src={player.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-primary/30" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center text-lg font-bold text-primary">
              {initial}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-sm truncate">
            {player.display_name || "Player"}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {player.padel_level != null && (
              <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                Level {player.padel_level.toFixed(1)}
              </span>
            )}
            {side && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sideCls}`}>
                {side}
              </span>
            )}
          </div>
        </div>

        {/* Action button */}
        {showContactAction && (
          <div className="shrink-0 flex items-center gap-1.5">
            {contactStatus.status === "none" && (
              <button
                onClick={() => handleSendRequest(player.user_id)}
                disabled={sendingRequest === player.user_id}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors active:scale-95 disabled:opacity-50"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add to Contact
              </button>
            )}
            {contactStatus.status === "pending_sent" && (
              <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted text-muted-foreground text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                Request Sent
              </span>
            )}
            {contactStatus.status === "pending_received" && (
              <>
                <button
                  onClick={() => handleRespondRequest(contactStatus.requestId!, "accepted")}
                  className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary hover:bg-primary/25 transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleRespondRequest(contactStatus.requestId!, "rejected")}
                  className="w-8 h-8 rounded-lg bg-destructive/15 flex items-center justify-center text-destructive hover:bg-destructive/25 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
            {contactStatus.status === "accepted" && (
              <button
                onClick={() => handleStartChat(player.user_id)}
                disabled={startingChat === player.user_id}
                className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors active:scale-95 disabled:opacity-50"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Contacts tab: always show message button with unread dot */}
        {!showContactAction && (
          <div className="relative shrink-0">
            <button
              onClick={() => handleStartChat(player.user_id)}
              disabled={startingChat === player.user_id}
              className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors active:scale-95 disabled:opacity-50"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            {(unreadByContact.get(player.user_id) || 0) > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive border-2 border-card" />
            )}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-display font-bold">Messages</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Match Chats Tab */}
      {tab === "matches" && (
        <MatchChatList conversations={matchConvs} loading={loading} navigate={navigate} />
      )}

      {/* Contacts Tab */}
      {tab === "contacts" && (
        <div className="space-y-2">
          {contactPlayers.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">No contacts yet. Add players from the Players tab!</p>
            </div>
          ) : (
            contactPlayers.map((p) => renderPlayerRow(p, false))
          )}
        </div>
      )}

      {/* Players Tab */}
      {tab === "players" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, location or club…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>

          {filteredPlayers.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">No players found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPlayers.map((player) => renderPlayerRow(player, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Match Chat list with rich cards */
function MatchChatList({
  conversations,
  loading,
  navigate,
}: {
  conversations: ConversationPreview[];
  loading: boolean;
  navigate: (path: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center">
          <IconMatches className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">
          No match chats yet. Create or join a match to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv) => (
        <motion.button
          key={conv.id}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate(`/messages/${conv.id}`)}
          className="w-full flex items-start gap-3 p-3.5 rounded-xl hover:bg-muted/50 transition-colors text-left card-elevated"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <IconMatches className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm truncate">
                {conv.title || conv.match_club || "Match Chat"}
              </p>
              <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                {formatTime(conv.last_message_at)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
              {conv.match_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(conv.match_date + "T00:00:00"), "MMM d")}
                </span>
              )}
              {conv.match_time && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {conv.match_time.slice(0, 5)} <span className="opacity-60">(club time)</span>
                </span>
              )}
              {conv.match_player_count != null && (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {conv.match_player_count} player{conv.match_player_count !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-1">
              {conv.last_message || "No messages yet"}
            </p>
          </div>
          {conv.unread_count > 0 && (
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-primary-foreground">
                {conv.unread_count > 9 ? "9+" : conv.unread_count}
              </span>
            </div>
          )}
        </motion.button>
      ))}
    </div>
  );
}

export default Messages;
