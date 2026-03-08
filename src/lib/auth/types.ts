export type SessionClaims = {
  sub?: string;
  sid?: string;
  iss?: string;
  iat?: number;
  exp?: number;
  nbf?: number;
  azp?: string;
  metadata?: {
    role?: string;
  };
  [key: string]: unknown;
};

export type AuthResult = {
  userId: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  sessionClaims: SessionClaims | null;
  sessionStatus: "active" | null;
  tokenType: "session_token" | null;
  orgId: undefined;
  orgRole: undefined;
  orgSlug: undefined;
  orgPermissions: undefined;
  factorVerificationAge: [number, number] | null;
  actor: undefined;
  getToken: (options?: { template?: string }) => Promise<string | null>;
  has: (params: { role?: string; permission?: string }) => boolean;
  redirectToSignIn: (options?: { returnBackUrl?: string }) => never;
};

export type StubEmailAddress = {
  id: string;
  emailAddress: string;
  verification: { status: "verified" };
};

export type CurrentUserResult = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  username: string | null;
  imageUrl: string;
  hasImage: boolean;
  emailAddresses: StubEmailAddress[];
  primaryEmailAddressId: string | null;
  primaryEmailAddress: StubEmailAddress | null;
  publicMetadata: {
    role?: string;
  };
  privateMetadata: Record<string, unknown>;
  unsafeMetadata: Record<string, unknown>;
  passwordEnabled: boolean;
  banned: boolean;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
  lastSignInAt: number | null;
  lastActiveAt: number | null;
};
