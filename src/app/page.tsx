import { configured, serverClient } from "@/lib/supabase/server";
import PantryApp from "@/components/pantry-app";
export const dynamic = "force-dynamic";
export default async function Page() {
  let authenticated = false;
  if (configured()) {
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    authenticated = !!user;
  }
  return (
    <PantryApp cloudConfigured={configured()} authenticated={authenticated} />
  );
}
