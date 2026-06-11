import type { McSponsorRead, ShowSponsor } from "@/lib/types";

export function sortMcSponsorReads(reads: McSponsorRead[]) {
  return [...reads].sort((readA, readB) => {
    if (readA.placement_order !== readB.placement_order) {
      return readA.placement_order - readB.placement_order;
    }

    return readA.created_at.localeCompare(readB.created_at);
  });
}

export function buildMcPlacementSponsors(
  showSponsors: ShowSponsor[],
  sponsorReads: McSponsorRead[],
) {
  const sponsorLookup = showSponsors.reduce<Record<string, ShowSponsor>>((lookup, sponsor) => {
    lookup[sponsor.id] = sponsor;
    return lookup;
  }, {});

  return sortMcSponsorReads(sponsorReads).flatMap((read) => {
    const sponsor = sponsorLookup[read.show_sponsor_id];

    if (!sponsor) {
      return [];
    }

    return [
      {
        ...sponsor,
        id: read.id,
        show_sponsor_assignment_id: sponsor.id,
        placement_order: read.placement_order,
        placement_type: read.placement_type,
        mc_anchor_song_id: read.anchor_song_id,
        linked_performer: read.linked_performer,
        custom_note: read.custom_note,
        created_at: read.created_at,
      },
    ];
  });
}
