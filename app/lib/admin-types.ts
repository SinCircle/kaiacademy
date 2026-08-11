export type AdminProblem = {
  id: string;
  shortCode: string;
  title: string;
  status: string;
  isHidden: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  creatorName: string;
  creatorEmail: string;
  participantCount: number;
  messageCount: number;
};

export type AdminMember = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  initials: string;
  avatarUpdatedAt: string | null;
  role: "member" | "admin" | "superadmin";
  accountStatus: "active" | "suspended";
  inviteQuota: number;
  createdAt: string;
  createdProblemCount: number;
  participatingCount: number;
  messageCount: number;
};
