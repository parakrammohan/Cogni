export type Role = "caregiver" | "patient";

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  display_name: string;
  /** Data URL or remote URL for the avatar shown in the TopBar dropdown
   *  and sidebar identity tile. Empty string = fall back to initials. */
  photo_url: string;
}

export interface SignupBody {
  username: string;
  password: string;
  role: Role;
  display_name: string;
  invite_code?: string;
}

export interface LoginBody {
  username: string;
  password: string;
}
