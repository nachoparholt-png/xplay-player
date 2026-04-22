import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Users, Info } from "lucide-react";
import { IconMatches } from "@/components/icons/XPlayIcons";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isYesterday, isSameDay } from "date-fns";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  message_text: string;
  message_type: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
};

type ConversationInfo = {
  id: string;
  type: string;
  title: string | null;
  match_id: string | null;
  other_user_name: string | null;
  other_user_avatar: string | null;
  participant_count: number;
};

const formatMessageTime = (dateStr: string) => format(new Date(dateStr), "HH:mm");

const formatDateSeparator = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
};

const ChatThread = () => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [convInfo, setConvInfo] = useState<ConversationInfo | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchConversation = useCallback(async () => {
    if (!conversationId || !user) return;

    const { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (!conv) {
      setLoading(false);
      return;
    }

    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .is("left_at", null);

    let otherUserName: string | null = null;
    let otherUserAvatar: string | null = null;

    if (conv.type === "direct" && participants) {
      const otherId = participants.find((p) => p.user_id !== user.id)?.user_id;
      if (otherId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", otherId)
          .single();
        otherUserName = prof?.display_name || null;
        otherUserAvatar = prof?.avatar_url || null;
      }
    }

    setConvInfo({
      id: conv.id,
      type: conv.type,
      title: conv.title,
      match_id: conv.match_id,
      other_user_name: otherUserName,
      other_user_avatar: otherUserAvatar,
      participant_count: participants?.length || 0,
    });

    setLoading(false);
  }, [conversationId, user]);

  const markMessagesAsRead = useCallback(async (msgs: Message[]) => {
    if (!user || !conversationId) return;
    const unreadIds = msgs
      .filter((m) => m.sender_id && m.sender_id !== user.id)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;

    await supabase.from("message_reads").upsert(
      unreadIds.map((id) => ({ message_id: id, user_id: user.id })),
      { onConflict: "message_id,user_id", ignoreDuplicates: true }
    );
  }, [user, conversationId]);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (!data) return;

    const senderIds = [...new Set(data.filter((m) => m.sender_id).map((m) => m.sender_id!))];
    const nameMap = new Map<string, { name: string; avatar: string | null }>();

    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", senderIds);

      profiles?.forEach((p) => {
        nameMap.set(p.user_id, {
          name: p.display_name || "Player",
          avatar: p.avatar_url,
        });
      });
    }

    const enriched: Message[] = data.map((m) => ({
      ...m,
      sender_name: m.sender_id ? nameMap.get(m.sender_id)?.name || "Player" : undefined,
      sender_avatar: m.sender_id ? nameMap.get(m.sender_id)?.avatar || undefined : undefined,
    }));

    setMessages(enriched);
    setTimeout(scrollToBottom, 100);

    // Mark messages as read
    await markMessagesAsRead(enriched);
  }, [conversationId, scrollToBottom, markMessagesAsRead]);

  useEffect(() => {
    fetchConversation();
    fetchMessages();
  }, [fetchConversation, fetchMessages]);

  // Real-time messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const msg = payload.new as Message;
          let senderName: string | undefined;
          let senderAvatar: string | undefined;

          if (msg.sender_id) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("user_id", msg.sender_id)
              .single();
            senderName = prof?.display_name || "Player";
            senderAvatar = prof?.avatar_url || undefined;
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, { ...msg, sender_name: senderName, sender_avatar: senderAvatar }];
          });
          setTimeout(scrollToBottom, 100);

            // Mark as read if from someone else
            if (msg.sender_id && msg.sender_id !== user?.id) {
              await supabase.from("message_reads").upsert(
                [{ message_id: msg.id, user_id: user!.id }],
                { onConflict: "message_id,user_id", ignoreDuplicates: true }
              );
            }

            if (msg.message_type === "system_message") {
              fetchConversation();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [conversationId, scrollToBottom, fetchConversation, user]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !conversationId || sending) return;
    setSending(true);
    const text = newMessage.trim();
    setNewMessage("");

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      message_text: text,
      message_type: "user_message",
    });

    // Send notification for direct chats
    if (convInfo?.type === "direct" && convInfo.other_user_name) {
      const senderName = user.user_metadata?.full_name || user.user_metadata?.name || "Someone";
      // Get the other user's ID from participants
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user.id)
        .is("left_at", null)
        .limit(1)
        .maybeSingle();

      if (parts) {
        const { data: senderProfile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .single();

        await supabase.rpc("create_notification_for_user", {
          _user_id: parts.user_id,
          _type: "direct_message",
          _title: "New Message",
          _body: `New message from ${senderProfile?.display_name || senderName}`,
          _link: `/messages/${conversationId}`,
        });
      }
    }

    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const headerTitle = convInfo?.type === "direct"
    ? convInfo.other_user_name || "Chat"
    : convInfo?.title || "Match Chat";

  const headerSubtitle = convInfo?.type === "match"
    ? `${convInfo.participant_count} player${convInfo.participant_count !== 1 ? "s" : ""}`
    : undefined;

  // Check if this is a solo match chat (only system messages, 1 participant)
  const isSoloMatchChat =
    convInfo?.type === "match" &&
    convInfo.participant_count <= 1 &&
    messages.every((m) => m.message_type === "system_message" || m.sender_id === user?.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!convInfo) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-muted-foreground">Conversation not found.</p>
        <Button variant="outline" onClick={() => navigate("/messages")} className="mt-4">Back to Messages</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] lg:h-screen">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border/50 bg-card/95 backdrop-blur-sm flex items-center gap-3">
        <button onClick={() => navigate("/messages")} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          convInfo.type === "match" ? "bg-primary/10" : "bg-muted"
        }`}>
          {convInfo.type === "match" ? (
            <IconMatches className="w-5 h-5 text-primary" />
          ) : convInfo.other_user_avatar ? (
            <img src={convInfo.other_user_avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <span className="text-sm font-bold">{headerTitle[0]?.toUpperCase()}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-sm truncate">{headerTitle}</p>
          {headerSubtitle && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              {headerSubtitle}
            </p>
          )}
        </div>

        {convInfo.match_id && (
          <button
            onClick={() => navigate(`/matches/${convInfo.match_id}`)}
            className="text-xs text-primary font-semibold hover:underline"
          >
            View Match
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {/* Solo match chat hint */}
        {isSoloMatchChat && messages.filter((m) => m.sender_id === user?.id).length === 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/10 mb-4">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-primary">Match chat is ready</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                You can leave notes here for players who join later. Messages will appear for everyone in the match.
              </p>
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">No messages yet. Say hello! 👋</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const showDateSeparator = !prevMsg || !isSameDay(new Date(msg.created_at), new Date(prevMsg.created_at));
          const isOwn = msg.sender_id === user?.id;
          const isSystem = msg.message_type === "system_message";

          const showSenderName = convInfo.type === "match" && !isOwn && !isSystem &&
            (!prevMsg || prevMsg.sender_id !== msg.sender_id || prevMsg.message_type === "system_message");

          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div className="flex items-center justify-center py-3">
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                    {formatDateSeparator(msg.created_at)}
                  </span>
                </div>
              )}

              {isSystem ? (
                <div className="flex justify-center py-1.5">
                  <span className="text-[11px] text-muted-foreground italic bg-muted/50 px-3 py-1 rounded-full max-w-[80%] text-center">
                    {msg.message_text}
                  </span>
                </div>
              ) : (
                <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-0.5`}>
                  <div className={`max-w-[80%] ${isOwn ? "items-end" : "items-start"}`}>
                    {showSenderName && (
                      <p className="text-[10px] font-semibold text-primary ml-3 mb-0.5">
                        {msg.sender_name}
                      </p>
                    )}
                    <div
                      className={`px-3.5 py-2 rounded-2xl ${
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.message_text}</p>
                      <p className={`text-[9px] mt-0.5 ${
                        isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
                      }`}>
                        {formatMessageTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-4 py-3 border-t border-border/50 bg-card/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className={`p-2.5 rounded-xl transition-colors ${
              newMessage.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatThread;
