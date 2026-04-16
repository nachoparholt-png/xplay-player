import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface AdminContextType {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isManager: boolean;
  managedClubIds: string[];
  loading: boolean;
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  isSuperAdmin: false,
  isManager: false,
  managedClubIds: [],
  loading: true,
});

export const useAdmin = () => useContext(AdminContext);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [managedClubIds, setManagedClubIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setIsManager(false);
      setManagedClubIds([]);
      setLoading(false);
      return;
    }

    const checkRoles = async () => {
      const [adminResult, membershipResult] = await Promise.all([
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
        supabase
          .from("club_memberships")
          .select("club_id, role")
          .eq("user_id", user.id)
          .in("role", ["manager", "admin", "club_owner", "club_admin"])
          .eq("active", true),
      ]);

      setIsAdmin(!!adminResult.data);

      const clubs = membershipResult.data ?? [];
      setIsManager(clubs.length > 0);
      setManagedClubIds(clubs.map((c) => c.club_id));

      setLoading(false);
    };

    checkRoles();
  }, [user]);

  return (
    <AdminContext.Provider
      value={{
        isAdmin,
        isSuperAdmin: isAdmin,
        isManager,
        managedClubIds,
        loading,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};
