export type Role = "caregiver" | "patient";

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  display_name: string;
}

export interface TokenResponse {
  user: AuthUser;
  access_token: string;
  token_type: "bearer";
  expires_in: number;
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
