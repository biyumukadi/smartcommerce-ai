import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { listConversations } from "@/lib/messaging/conversations";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { InboxActions } from "@/components/inbox-actions";
import { prisma } from "@/lib/db";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);
  const { storeMembers } = await getUserMemberships(session.user.id);
  const store = storeMembers[0]?.store;
  if (!store) return <p>Aucune boutique</p>;

  const conversations = await listConversations(store.id);
  const details = await Promise.all(
    conversations.slice(0, 20).map((c) =>
      prisma.conversation.findFirst({
        where: { id: c.id },
        include: {
          customer: true,
          messages: { orderBy: { createdAt: "asc" }, take: 30 },
        },
      }),
    ),
  );
  const wa = getWhatsAppProvider().describe();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Inbox WhatsApp</h1>
        <p className="text-sm text-[var(--muted)]">
          Conversations centralisées · handoff humain · assistant IA grounded
          catalogue
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Provider: {wa.id} · {wa.mode} ·{" "}
          {wa.available ? "disponible" : "indisponible"} — {wa.notesFr}
        </p>
      </div>

      <div className="space-y-4">
        {details.map((c) => {
          if (!c) return null;
          return (
            <Card key={c.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {c.customer?.name || c.customer?.phone || c.externalThreadId}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {c.status}
                    {c.aiEnabled ? " · IA on" : " · IA off"} ·{" "}
                    {c.lastMessageAt?.toISOString() || c.createdAt.toISOString()}
                  </p>
                </div>
              </div>
              <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
                {c.messages.map((m) => (
                  <li key={m.id} className="text-[var(--muted)]">
                    <span className="font-medium text-[var(--ink)]">
                      {m.direction}
                    </span>{" "}
                    [{m.status}] {m.body}
                    {m.error ? ` — ${m.error}` : ""}
                  </li>
                ))}
              </ul>
              <InboxActions
                storeId={store.id}
                conversationId={c.id}
                status={c.status}
              />
            </Card>
          );
        })}
        {details.length === 0 && (
          <Card className="text-[var(--muted)]">
            Aucune conversation. Utilisez le mock inbound ou Cloud API webhook.
          </Card>
        )}
      </div>
    </div>
  );
}
