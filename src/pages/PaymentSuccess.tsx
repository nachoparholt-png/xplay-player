import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "loading" | "success" | "error";

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setErrorMsg("Missing session ID");
      return;
    }

    const finalise = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("store-order", {
          body: { action: "finalise", stripe_session_id: sessionId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setStatus("success");
        refreshProfile();
        queryClient.invalidateQueries({ queryKey: ["store-products"] });
        queryClient.invalidateQueries({ queryKey: ["store-product"] });
        queryClient.invalidateQueries({ queryKey: ["store-delivery-settings"] });
        queryClient.invalidateQueries({ queryKey: ["redemption-orders"] });
      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err.message || "Something went wrong");
      }
    };

    finalise();
  }, [sessionId]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center space-y-4">
      {status === "loading" && (
        <>
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Finalising your order…</p>
        </>
      )}

      {status === "success" && (
        <>
          <CheckCircle className="w-16 h-16 text-green-500" />
          <h1 className="font-display text-2xl font-bold">Order confirmed</h1>
          <p className="text-muted-foreground">Thanks! We'll let you know when it's on its way.</p>
          <Button onClick={() => navigate("/orders")}>View my orders</Button>
        </>
      )}

      {status === "error" && (
        <>
          <XCircle className="w-16 h-16 text-destructive" />
          <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground">{errorMsg}</p>
          <Button variant="outline" onClick={() => navigate("/marketplace")}>Back to the store</Button>
        </>
      )}
    </div>
  );
};

export default PaymentSuccess;
