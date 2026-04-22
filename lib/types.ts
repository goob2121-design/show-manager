export type ViewMode = "guest" | "band" | "admin";
export type SubmittedByRole = "guest" | "band" | "admin";
export type SetSection = "set1" | "set2" | "encore";

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

export type SetlistSong = {
  id: string;
  show_id: string;
  position: number;
  set_section: SetSection;
  source_role: SubmittedByRole | string | null;
  title: string;
  artist: string | null;
  song_key: string | null;
  notes: string | null;
  lyrics: string | null;
  created_at: string;
};

export type PendingSubmission = {
  id: string;
  show_id: string;
  title: string;
  artist: string | null;
  song_key: string | null;
  notes: string | null;
  lyrics: string | null;
  submitted_by_role: SubmittedByRole | string;
  submitted_by_name: string | null;
  created_at: string;
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

export type SongLibrarySong = {
  id: string;
  title: string;
  artist: string | null;
  song_key: string | null;
  notes: string | null;
  lyrics: string | null;
  source_role: SubmittedByRole | string | null;
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
  submittedByName: string;
  title: string;
  artist: string;
  key: string;
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
