export const MAX_PLAYGROUND_RESOURCES = 5;
export const MAX_PLAYGROUND_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PLAYGROUND_RESOURCE_NAME = 160;
export const MAX_PLAYGROUND_RESOURCE_DESCRIPTION = 240;
export const PLAYGROUND_VIEW_WINDOW_MS = 30 * 60 * 1000;
export const PLAYGROUND_COMMENT_MARKERS = [
  { emoji: "👍", label: "赞同" },
  { emoji: "❤️", label: "喜欢" },
  { emoji: "😂", label: "有趣" },
  { emoji: "😮", label: "惊讶" },
  { emoji: "😢", label: "遗憾" },
  { emoji: "👏", label: "鼓掌" },
  { emoji: "💡", label: "启发" },
  { emoji: "🎉", label: "庆祝" },
  { emoji: "👀", label: "关注" },
  { emoji: "🤝", label: "协作" },
  { emoji: "✅", label: "确认" },
  { emoji: "❓", label: "疑问" },
  { emoji: "🚀", label: "推进" },
  { emoji: "🔥", label: "热门" },
  { emoji: "🤔", label: "思考" },
  { emoji: "🧠", label: "深度" },
] as const;

export type PlaygroundCommentMarker = typeof PLAYGROUND_COMMENT_MARKERS[number]["emoji"];

export type PlaygroundCommentReaction = {
  emoji: PlaygroundCommentMarker;
  count: number;
  reactedByViewer: boolean;
};

export function isPlaygroundCommentMarker(value: unknown): value is PlaygroundCommentMarker {
  return typeof value === "string" && PLAYGROUND_COMMENT_MARKERS.some((option) => option.emoji === value);
}

export function playgroundViewWindowStart(timestamp = Date.now()) {
  return new Date(Math.floor(timestamp / PLAYGROUND_VIEW_WINDOW_MS) * PLAYGROUND_VIEW_WINDOW_MS).toISOString();
}

export type PlaygroundResourceKind = "upload" | "external";

export type PlaygroundResource = {
  id: string;
  kind: PlaygroundResourceKind;
  displayName: string;
  description: string;
  mimeType: string | null;
  byteSize: number | null;
  sha256: string | null;
  downloadCount: number;
  externalUrl: string | null;
  createdAt: string;
};

export type PlaygroundPostCard = {
  id: string;
  title: string;
  summary: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorInitials: string;
  authorAvatarUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  tags: string[];
  resourceCount: number;
  uploadedBytes: number;
  resourceFormats: string[];
  commentCount: number;
  upvotes: number;
  bookmarkCount: number;
  downloadCount: number;
  viewCount: number;
  interactionCount: number;
  interactionAvatars: Array<{ id: string; initials: string; avatarUpdatedAt: string | null }>;
  isVoted: boolean;
  isBookmarked: boolean;
};

export type PlaygroundComment = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  reactions: PlaygroundCommentReaction[];
  isFeatured: boolean;
  isHidden: boolean;
  isHiddenBranch: boolean;
  upvotes: number;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorInitials: string;
  authorAvatarUpdatedAt: string | null;
  isVoted: boolean;
  canHide: boolean;
  canDelete: boolean;
  canFeature: boolean;
};

export function comparePlaygroundCommentRank(left: Pick<PlaygroundComment, "isFeatured" | "upvotes" | "createdAt">, right: Pick<PlaygroundComment, "isFeatured" | "upvotes" | "createdAt">) {
  return Number(right.isFeatured) - Number(left.isFeatured) || right.upvotes - left.upvotes || left.createdAt.localeCompare(right.createdAt);
}

export type PlaygroundDetailData = {
  post: {
    id: string;
    title: string;
    body: string;
    authorId: string;
    authorName: string;
    authorUsername: string;
    authorInitials: string;
    authorAvatarUpdatedAt: string | null;
    createdAt: string;
    updatedAt: string;
    tags: string[];
    upvotes: number;
    bookmarkCount: number;
    viewCount: number;
    isVoted: boolean;
    isBookmarked: boolean;
  };
  resources: PlaygroundResource[];
  comments: PlaygroundComment[];
  viewer: null | {
    id: string;
    role: "member" | "admin" | "superadmin";
    initials: string;
    avatarUpdatedAt: string | null;
    isAuthor: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canModerateComments: boolean;
  };
};

export type AdminPlaygroundPost = {
  id: string;
  title: string;
  isHidden: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorEmail: string;
  resourceCount: number;
  commentCount: number;
  downloadCount: number;
};

export type DraftExternalResource = {
  displayName: string;
  description: string;
  url: string;
};

const blockedExtensions = new Set([
  "apk", "app", "bat", "bin", "cmd", "com", "cpl", "dll", "dmg", "exe", "gadget", "hta", "inf", "ins", "ipa",
  "iso", "jar", "js", "jse", "lnk", "msc", "msi", "msp", "mst", "pif", "ps1", "reg", "scr", "sh", "sys", "vb", "vbe", "vbs", "ws", "wsc", "wsf", "wsh",
]);

export function resourceExtension(filename: string) {
  const match = filename.trim().toLocaleLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match?.[1] ?? "";
}

export function validatePlaygroundUpload(file: Pick<File, "name" | "size" | "type">) {
  if (!file.name.trim() || file.name.length > MAX_PLAYGROUND_RESOURCE_NAME) return "文件名无效或过长";
  if (file.size <= 0) return "不能上传空文件";
  if (file.size > MAX_PLAYGROUND_UPLOAD_BYTES) return "单个文件不能超过 10 MB";
  const extension = resourceExtension(file.name);
  if (!extension || blockedExtensions.has(extension)) return "不支持这种文件格式";
  if (/^(application\/x-ms|application\/x-dosexec|application\/vnd\.android|application\/java-archive)/i.test(file.type)) return "不支持可执行文件";
  return null;
}

export function normalizeExternalResourceUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (!(url.protocol === "https:" || url.protocol === "http:")) return null;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function externalResourceHost(value: string) {
  try { return new URL(value).host; } catch { return "外部网站"; }
}

export function formatResourceBytes(bytes: number | null) {
  if (bytes === null) return "外部资源";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
