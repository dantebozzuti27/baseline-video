export type Role = "coach" | "player" | "parent";
export type VideoCategory = "game" | "training";

export type Profile = {
  user_id: string;
  team_id: string;
  role: Role;
  display_name: string;
  first_name: string;
  last_name: string;
  player_mode?: "in_person" | "hybrid" | "remote" | null;
  is_active?: boolean | null;
  is_admin?: boolean;
  last_seen_feed_at?: string | null;
  created_at: string;
};

export type Video = {
  id: string;
  team_id: string;
  uploader_user_id: string;
  owner_user_id: string;
  category: VideoCategory;
  source?: "upload" | "link";
  title: string;
  storage_path?: string | null;
  external_url?: string | null;
  created_at: string;
  last_activity_at?: string | null;
};

export type Comment = {
  id: string;
  video_id: string;
  author_user_id: string;
  body: string;
  timestamp_seconds: number | null;
  created_at: string;
  visibility?: "team" | "player_private" | "coach_only";
  deleted_at?: string | null;
};
