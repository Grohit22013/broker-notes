import type { Metadata } from "next";

import { OrganisationNameForm } from "@/components/team/organisation-name-form";
import { InvitesSection } from "@/components/team/invites-section";
import { MembersList } from "@/components/team/members-list";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { getOrganisation } from "@/lib/api/queries";
import { canManageTeam, ROLES } from "@broker-notes/shared/orgs/roles";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const user = await requireUser();
  const org = await getOrganisation();
  const isAdmin = canManageTeam(user);
  const activeCount = org.members.filter((m) => m.active).length;

  return (
    <div className="container-page max-w-4xl">
      <PageHeader
        title="Team"
        description={`${org.name} · ${activeCount} active ${activeCount === 1 ? "member" : "members"}`}
      />

      <div className="grid grid-cols-1 gap-8 pb-10">
        {isAdmin ? <OrganisationNameForm name={org.name} /> : null}

        <section aria-labelledby="members-title" className="grid min-w-0 grid-cols-1 gap-3">
          <h2 id="members-title" className="text-lg font-semibold">
            Members
          </h2>
          <MembersList members={org.members} currentUserId={user.id} canManage={isAdmin} />
        </section>

        {isAdmin ? <InvitesSection invites={org.invites} /> : null}

        <section aria-labelledby="roles-title" className="grid min-w-0 grid-cols-1 gap-3">
          <h2 id="roles-title" className="text-lg font-semibold">
            What each role can do
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {ROLES.map((r) => (
              <li key={r.value} className="bg-card rounded-xl border p-4">
                <p className="font-medium">{r.label}</p>
                <p className="text-muted-foreground mt-1 text-sm">{r.description}</p>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">
            Everyone in the brokerage can read its notes and clients. Notes can only be changed by
            their author or an admin, and every important action is recorded in the audit log.
          </p>
        </section>
      </div>
    </div>
  );
}
