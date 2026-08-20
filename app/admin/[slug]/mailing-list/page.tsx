import { MailingListAdmin } from "@/app/components/mailing-list-admin";
export default async function MailingListAdminPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <MailingListAdmin slug={slug} />; }
