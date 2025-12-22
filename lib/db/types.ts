export type Role = "coach" | "player";
export type VideoCategory = "game" | "training";

export type Profile = {
  user_id: string;
  team_id: string;
  role: Role;
  display_name: string;
  first_name: string;
  last_name: string;
  created_at: string;
};

export type Video = {
  id: string;
  team_id: string;
  uploader_user_id: string;
  owner_user_id: string;
  category: VideoCategory;
  title: string;
  storage_path: string;
  created_at: string;
};

export type Comment = {
  id: string;
  video_id: string;
  author_user_id: string;
  body: string;
  timestamp_seconds: number | null;
  created_at: string;
};
