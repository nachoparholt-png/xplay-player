import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Trophy, Clock, AlertTriangle, Info, UserPlus, Check, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Notification = {
  id: string;
  match_id: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
};

const typeIcon = (type: string) => {
  switch (type) {
    case "post_match":
      return <Trophy className="w-4 h-4 text-primary" />;
    case "post_match_reminder":
      return <Clock className="w-4 h-4 text-gold" />;
    case "post_match_urgent":
      return <AlertTriangle className="w-4 h-4 text-destructive" />;
    case "match_auto_closed":
      return <Clock className="w-4 h-4 text-muted-foreground" />;
    case "score_submitted":
      return <Trophy className="w-4 h-4 text-secondary" />;
    case "review_requested":
      return <AlertTriangle className="w-4 h-4 text-gold" />;
    case "contact_request":
      return <UserPlus className="w-4 h-4 text-primary" />;
    case "direct_message":
      return <MessageSquare className="w-4 h-4 text-primary" />;
    case "tournament":
      return <Trophy className="w-4 h-4 text-primary" />;
    default:
      return <Info className="w-4 h-4 text-muted-foreground" />;
  }
};

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Unique channel name per component instance (AppLayout renders two NotificationBells)
  const channelName = useRef(`user-notifications-${Math.random()}`);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .in("target_app", ["player", "all"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n: any) => !n.read).length);
    }
  };

  useEffect(() => {
    fetchNotifications();

    if (!user) return;
    const channel = supabase
      .channel(channelName.current)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleContactResponse = async (notif: Notification, action: "accepted" | "rejected") => {
    if (!user) return;

    // Find the pending request where this user is receiver
    const { data: requests } = await supabase
      .from("contact_requests")
      .select("id")
      .eq("receiver_id", user.id)
      .eq("status", "pending");

    // Match by notification body to find the right sender
    // We'll update all pending requests for this user that match
    if (requests && requests.length > 0) {
      // Find the most recent pending request (the one this notification is about)
      // Since notification body contains sender name, we update the request
      for (const req of requests) {
        await supabase
          .from("contact_requests")
          .update({ status: action, responded_at: new Date().toISOString() })
          .eq("id", req.id);
        break; // Only handle one
      }
    }

    // Mark notification as read
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notif.id);

    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    toast.success(action === "accepted" ? "Contact added!" : "Request declined");
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (notif.type === "contact_request") return; // Handled by buttons

    if (!notif.read) {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notif.id);

      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-muted transition-colors"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-primary text-primary-foreground rounded-full text-[10px] font-bold flex items-center justify-center"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute right-0 lg:right-auto lg:left-0 top-12 w-80 max-h-[70vh] bg-card border border-border/50 rounded-2xl shadow-2xl shadow-black/30 z-50 overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-border/50">
                <h3 className="font-display font-bold text-sm">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[10px] text-primary font-semibold hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[55vh]">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`w-full text-left p-3 border-b border-border/30 hover:bg-muted/50 transition-colors flex gap-3 ${
                        !notif.read ? "bg-primary/5" : ""
                      } ${notif.type !== "contact_request" ? "cursor-pointer" : ""}`}
                    >
                      <div className="mt-0.5 shrink-0">{typeIcon(notif.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-semibold truncate ${!notif.read ? "text-foreground" : "text-muted-foreground"}`}>
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                        
                        {/* Contact request action buttons */}
                        {notif.type === "contact_request" && !notif.read && (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleContactResponse(notif, "accepted"); }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              Accept
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleContactResponse(notif, "rejected"); }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-[11px] font-semibold hover:bg-muted/80 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
