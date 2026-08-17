export type SessionMember = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  initials: string;
  role: "member" | "admin" | "superadmin";
  accountStatus: "active" | "suspended";
  avatarUpdatedAt: string | null;
  inviteQuota: number;
  apiEnabled: boolean;
  apiQualified: boolean;
  createdAt: string;
};

export type ProblemCard = {
  id: string;
  shortCode: string;
  title: string;
  summary: string;
  status: string;
  isPinned: boolean;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  participantCount: number;
  attentionCount: number;
  participantAvatars: Array<{ id: string; initials: string; avatarUpdatedAt: string | null }>;
  participantInitials: string[];
  viewerRelation: "watching" | "following" | "participating";
};

export type ProblemPerson = {
  id: string;
  username: string;
  displayName: string;
  initials: string;
  avatarUpdatedAt: string | null;
  specialties: string[];
  relation: "participating" | "following";
  isManager: boolean;
  isAdopted: boolean;
  isCreator: boolean;
  joinedAt: string;
};

export type DiscussionMessage = {
  id: string;
  problemId: string;
  parentId: string | null;
  body: string;
  kind: "解法" | "见解" | "反例" | null;
  isHidden: boolean;
  isHiddenBranch: boolean;
  isAdopted: boolean;
  upvotes: number;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorInitials: string;
  authorAvatarUpdatedAt: string | null;
  reactions: import("./playground").PlaygroundCommentReaction[];
  isVoted: boolean;
  canLabel: boolean;
  canHide: boolean;
  canDelete: boolean;
};

export type ProblemDetailData = {
  problem: {
    id: string;
    shortCode: string;
    title: string;
    body: string;
    background: string;
    status: string;
    creatorId: string;
    creatorName: string;
    creatorUsername: string;
    createdAt: string;
    updatedAt: string;
    tags: string[];
  };
  participants: ProblemPerson[];
  followers: ProblemPerson[];
  messages: DiscussionMessage[];
  viewer: (SessionMember & {
    relation: "watching" | "following" | "participating";
    locked: boolean;
    isCreator: boolean;
    isManager: boolean;
    canManageParticipants: boolean;
    canEditProblem: boolean;
    canAdopt: boolean;
    canModerateComments: boolean;
  }) | null;
  availableMembers: Array<{ id: string; username: string; displayName: string; initials: string }>;
};
