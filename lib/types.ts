export type ViewMode = "guest" | "band" | "admin";
export type SubmittedByRole = "guest" | "band" | "admin";
export type SetSection = "set1" | "set2" | "encore";
export type SongTempo = "fast" | "medium" | "slow";
export type SongType = "vocal" | "instrumental";
export type SongSourceType = "library" | "guest";

export type ShowRecord = {
  id: string;
  slug: string;
  name: string;
  show_date: string | null;
  venue: string | null;
  is_archived: boolean;
  venue_address: string | null;
  directions_url: string | null;
  call_time: string | null;
  soundcheck_time: string | null;
  guest_arrival_time: string | null;
  band_arrival_time: string | null;
  show_start_time: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  parking_notes: string | null;
  load_in_notes: string | null;
  announcements: string | null;
  guest_message: string | null;
  opening_script: string | null;
  intermission_script: string | null;
  closing_script: string | null;
  created_at: string;
};

export type SongRecord = {
  id: string;
  title: string;
  key: string | null;
  tempo: SongTempo | null;
  song_type: SongType | null;
  notes?: string | null;
  lyrics?: string | null;
  created_by_role: Extract<SubmittedByRole, "band" | "admin"> | string;
  created_by_name: string | null;
  created_at: string;
};

export type ShowGuestSong = {
  id: string;
  show_id: string;
  title: string;
  key: string | null;
  tempo: SongTempo | null;
  song_type: SongType | null;
  submitted_by_name: string | null;
  created_at: string;
};

export type SetlistEntry = {
  id: string;
  show_id: string;
  section: SetSection;
  position: number;
  source_type: SongSourceType;
  song_id: string | null;
  guest_song_id: string | null;
  custom_title: string | null;
  created_at: string;
  title: string;
  key: string | null;
  tempo: SongTempo | null;
  song_type: SongType | null;
  notes?: string | null;
  lyrics?: string | null;
  performer_name: string | null;
};

export type GuestProfile = {
  id: string;
  show_id: string;
  name: string | null;
  short_bio: string | null;
  full_bio: string | null;
  hometown: string | null;
  instruments: string | null;
  facebook: string | null;
  instagram: string | null;
  website: string | null;
  photo_url: string | null;
  permission_granted: boolean;
  created_at: string;
};

export type SponsorLibraryEntry = {
  id: string;
  name: string;
  short_message: string | null;
  full_message: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
};

export type ShowSponsor = {
  id: string;
  show_id: string;
  sponsor_id: string | null;
  placement_order: number;
  placement_type: string | null;
  mc_anchor_song_id: string | null;
  linked_performer: string | null;
  custom_note: string | null;
  created_at: string;
  sponsor?: SponsorLibraryEntry | null;
};

export type SponsorLibraryFormState = {
  name: string;
  shortMessage: string;
  fullMessage: string;
  website: string;
  logoUrl: string;
};

export type ShowSponsorAssignmentFormState = {
  sponsorId: string;
  placementType: string;
  linkedPerformer: string;
  customNote: string;
};

export type McBlockNote = {
  id: string;
  show_id: string;
  anchor_song_id: string;
  intro_note: string | null;
  sponsor_mention: string | null;
  transition_note: string | null;
  created_at: string;
};

export type SongFormState = {
  title: string;
  key: string;
  tempo: "" | SongTempo;
  songType: "" | SongType;
  notes: string;
  lyrics: string;
};

export type GuestProfileFormState = {
  name: string;
  shortBio: string;
  fullBio: string;
  hometown: string;
  instruments: string;
  facebook: string;
  instagram: string;
  website: string;
  permissionGranted: boolean;
};

export type ShowDetailsFormState = {
  venue: string;
  venueAddress: string;
  directionsUrl: string;
  callTime: string;
  soundcheckTime: string;
  guestArrivalTime: string;
  bandArrivalTime: string;
  showStartTime: string;
  contactName: string;
  contactPhone: string;
  parkingNotes: string;
  loadInNotes: string;
  announcements: string;
  guestMessage: string;
};
