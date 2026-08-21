import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanMailingListName,
  isValidMailingListEmail,
  normalizeMailingListEmail,
  type MailingListSource,
} from "@/lib/mailing-list";

export type MailingListSubscriptionResult = {
  status: "subscribed" | "already_subscribed" | "resubscribe_required";
  subscriberId: string | null;
  created: boolean;
};

export async function subscribeMailingListContact(
  supabase: SupabaseClient,
  input: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    source: MailingListSource;
    confirmResubscribe?: boolean;
  },
): Promise<MailingListSubscriptionResult> {
  const email = normalizeMailingListEmail(input.email);
  const firstName = cleanMailingListName(input.firstName);
  const lastName = cleanMailingListName(input.lastName);
  if (!isValidMailingListEmail(email)) throw new Error("A valid mailing-list email address is required.");

  const { data: existing, error: lookupError } = await supabase
    .from("mailing_list_subscribers")
    .select("id,status")
    .ilike("email", email)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.status === "unsubscribed" && !input.confirmResubscribe) {
    return { status: "resubscribe_required", subscriberId: existing.id, created: false };
  }

  const now = new Date().toISOString();
  if (existing) {
    const changes = existing.status === "unsubscribed"
      ? {
          email,
          first_name: firstName || null,
          last_name: lastName || null,
          status: "active",
          source: input.source,
          subscribed_at: now,
          unsubscribed_at: null,
          updated_at: now,
        }
      : {
          ...(firstName ? { first_name: firstName } : {}),
          ...(lastName ? { last_name: lastName } : {}),
          updated_at: now,
        };
    const { error } = await supabase.from("mailing_list_subscribers").update(changes).eq("id", existing.id);
    if (error) throw error;
    return {
      status: existing.status === "active" ? "already_subscribed" : "subscribed",
      subscriberId: existing.id,
      created: false,
    };
  }

  const { data, error } = await supabase
    .from("mailing_list_subscribers")
    .insert({ email, first_name: firstName || null, last_name: lastName || null, source: input.source, status: "active" })
    .select("id")
    .single();
  if (error?.code === "23505") return { status: "already_subscribed", subscriberId: null, created: false };
  if (error) throw error;
  return { status: "subscribed", subscriberId: data.id, created: true };
}

export function splitMailingListFullName(fullName: string | null | undefined) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}
