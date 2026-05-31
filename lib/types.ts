export type ViewMode = "guest" | "band" | "admin";
export type SubmittedByRole = "guest" | "band" | "admin";
export type SetSection = "set1" | "set2" | "encore";
export type SongTempo = "fast" | "medium" | "slow";
export type SongType = "vocal" | "instrumental";
export type SongSourceType = "library" | "guest";
export type PromoMaterialCategory =
  | "flyer"
  | "social_graphic"
  | "sponsor_graphic"
  | "poster"
  | "video"
  | "audio_promo"
  | "printable"
  | "logo_branding"
  | "logo"
  | "promo_photo"
  | "other";
export type PromoLinkType =
  | "facebook_event"
  | "facebook_page"
  | "ticket_link"
  | "main_website"
  | "youtube_promo_video"
  | "instagram"
  | "sponsor_link"
  | "other";
export type FinanceItemType = "income" | "expense";
export type GuestListTicketType = "paid_online" | "door_paid" | "complimentary" | "manual";
export type SponsorTypeOption =
  | "Cash Package"
  | "In-Kind / Product Donation"
  | "Food & Beverage"
  | "Service Trade"
  | "Giveaway / Prize"
  | "Printing / Media"
  | "Custom";

export type ShowRecord = {
  id: string;
  slug: string;
  name: string;
  show_date: string | null;
  venue: string | null;
  show_logo_url: string | null;
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
  promo_short: string | null;
  promo_long: string | null;
  ticket_link: string | null;
  opening_script: string | null;
  intermission_script: string | null;
  closing_script: string | null;
  created_at: string;
};

export type SongRecord = {
  id: string;
  title: string;
  key: string | null;
  sung_by: string | null;
  tempo: SongTempo | null;
  song_type: SongType | null;
  notes?: string | null;
  lyrics?: string | null;
  chart_url?: string | null;
  created_by_role: Extract<SubmittedByRole, "band" | "admin"> | string;
  created_by_name: string | null;
  created_at: string;
};

export type ShowGuestSong = {
  id: string;
  show_id: string;
  title: string;
  key: string | null;
  sung_by: string | null;
  tempo: SongTempo | null;
  song_type: SongType | null;
  notes?: string | null;
  lyrics?: string | null;
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
  email: string | null;
  facebook: string | null;
  instagram: string | null;
  website: string | null;
  photo_url: string | null;
  agreed_fee: string | null;
  planned_song_count: number | null;
  backup_song_count: number | null;
  appearance_notes: string | null;
  guest_token: string | null;
  portal_opened_at: string | null;
  last_reminder_sent_at: string | null;
  is_confirmed: boolean;
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
  sponsor_type: SponsorTypeOption | string | null;
  default_contribution: string | null;
  estimated_value: number | null;
  recognition_notes: string | null;
  is_archived: boolean;
  sponsorship_level: string | null;
  sponsorship_amount: number | null;
  payment_status: string | null;
  proposal_generated_at: string | null;
  quote_generated_at: string | null;
  receipt_generated_at: string | null;
  created_at: string;
};

export type PotentialSponsorStatus =
  | "Not Contacted"
  | "Contacted"
  | "Interested"
  | "Follow Up"
  | "Became Sponsor"
  | "Passed";

export type PotentialSponsor = {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: PotentialSponsorStatus;
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
  sponsor_type: SponsorTypeOption | string | null;
  default_contribution: string | null;
  estimated_value: number | null;
  recognition_notes: string | null;
  comp_ticket_allowance: number;
  comp_tickets_checked_in: number;
  created_at: string;
  sponsor?: SponsorLibraryEntry | null;
};

export type PromoMaterial = {
  id: string;
  show_id: string;
  title: string;
  description: string | null;
  category: PromoMaterialCategory | string | null;
  file_name: string;
  file_path: string;
  file_url: string;
  file_mime_type: string | null;
  file_size: number | null;
  download_file_name: string | null;
  download_file_path: string | null;
  download_file_url: string | null;
  download_file_mime_type: string | null;
  download_file_size: number | null;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
};

export type PromoLink = {
  id: string;
  show_id: string;
  title: string;
  url: string;
  link_type: PromoLinkType | string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ShowFinanceItem = {
  id: string;
  show_id: string;
  type: FinanceItemType;
  category: string | null;
  label: string;
  amount: number;
  notes: string | null;
  created_at: string;
};

export type ShowChecklistItem = {
  id: string;
  show_id: string;
  task: string;
  completed: boolean;
  due_date: string | null;
  created_at: string;
};

export type ShowPayoutItem = {
  id: string;
  show_id: string;
  payee_name: string;
  category: string | null;
  description: string | null;
  amount: number;
  paid: boolean;
  payment_method: string | null;
  created_at: string;
};

export type ShowCompTicket = {
  id: string;
  show_id: string;
  guest_name: string;
  email: string | null;
  ticket_count: number;
  ticket_type: GuestListTicketType | string | null;
  order_id: string | null;
  import_key: string | null;
  notes: string | null;
  checked_in: boolean;
  checked_in_count: number;
  created_at: string;
};

export type RehearsalEntry = {
  id: string;
  show_id: string;
  song_id: string | null;
  custom_title: string | null;
  key: string | null;
  sung_by: string | null;
  notes: string | null;
  section_label: string | null;
  sort_order: number;
  created_at: string;
};

export type RehearsalRecording = {
  id: string;
  show_id: string;
  rehearsal_entry_id: string | null;
  file_name: string;
  file_path: string;
  file_url: string | null;
  created_at: string;
};

export type PromoMaterialFormState = {
  title: string;
  description: string;
  category: "" | PromoMaterialCategory;
  isVisible: boolean;
};

export type PromoLinkFormState = {
  title: string;
  url: string;
  linkType: "" | PromoLinkType;
  description: string;
};

export type SponsorLibraryFormState = {
  name: string;
  shortMessage: string;
  fullMessage: string;
  website: string;
  logoUrl: string;
  sponsorType: string;
  defaultContribution: string;
  estimatedValue: string;
  recognitionNotes: string;
};

export type ShowSponsorAssignmentFormState = {
  sponsorId: string;
  placementType: string;
  linkedPerformer: string;
  customNote: string;
  sponsorType: string;
  defaultContribution: string;
  estimatedValue: string;
  recognitionNotes: string;
  compTicketAllowance: string;
};

export type FinanceItemFormState = {
  label: string;
  category: string;
  amount: string;
  notes: string;
};

export type PayoutFormState = {
  payeeName: string;
  category: string;
  description: string;
  amount: string;
  paid: boolean;
  paymentMethod: string;
};

export type CompTicketFormState = {
  guestName: string;
  email: string;
  ticketCount: string;
  ticketType: GuestListTicketType;
  orderId: string;
  notes: string;
  checkedInCount: string;
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
  sungBy: string;
  tempo: "" | SongTempo;
  songType: "" | SongType;
  notes: string;
  lyrics: string;
  chartUrl: string;
};

export type GuestProfileFormState = {
  name: string;
  shortBio: string;
  fullBio: string;
  hometown: string;
  instruments: string;
  email: string;
  facebook: string;
  instagram: string;
  website: string;
  permissionGranted: boolean;
};

export type ShowDetailsFormState = {
  venue: string;
  showLogoUrl: string;
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
  promoShort: string;
  promoLong: string;
  ticketLink: string;
};
