export interface ICreatorProfile {
  id: string;
  userId: string;
  displayName: string | null;
  bio: string | null;
  website: string | null;
  avatarUrl: string | null;
  companyName: string | null;
  country: string | null;
  githubUrl: string | null;
  twitterUrl: string | null;
  isVerified: boolean;
  verifiedAt: Date | null;
  availableBalanceUsdc: string;
  pendingBalanceUsdc: string;
  frozenBalanceUsdc: string;
  totalCallsServed: number;
  createdAt: Date;
  updatedAt: Date;
}
