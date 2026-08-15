import { requireMember } from "../../../../db/auth";
import {
  createPlaygroundComment,
  deletePlaygroundCommentBranch,
  deletePlaygroundPost,
  getPlaygroundDetail,
  parsePlaygroundForm,
  recordPlaygroundMemberInteraction,
  recordPlaygroundView,
  setPlaygroundCommentHidden,
  togglePlaygroundCommentReaction,
  togglePlaygroundCommentFeatured,
  togglePlaygroundBookmark,
  togglePlaygroundCommentVote,
  togglePlaygroundPostVote,
  transferPlaygroundPost,
  updatePlaygroundPost,
} from "../../../../db/playground";
import { asString } from "../../../../db/runtime";
import { publishSyncInvalidation } from "../../../../db/sync";
import { apiError, assertSameOrigin, cachedJsonResponse } from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const member = await requireMember(request);
    await recordPlaygroundView(id, request, member);
    return cachedJsonResponse(request, await getPlaygroundDetail(id, member));
  } catch (error) {
    return apiError(error, "暂时无法读取内容");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    if ((request.headers.get("content-type") ?? "").toLocaleLowerCase().includes("multipart/form-data")) {
      const { payload, uploads } = parsePlaygroundForm(await request.formData());
      const post = await updatePlaygroundPost(id, member, payload, uploads);
      await publishSyncInvalidation([`/api/playground/${id}`, "/api/playground", "/api/admin/playground", "/api/members/"]);
      return Response.json({ post });
    }

    const payload = await request.json() as Record<string, unknown>;
    const action = asString(payload.action, 40);
    let result: unknown;
    if (action === "toggle_vote") result = await togglePlaygroundPostVote(id, member);
    else if (action === "toggle_bookmark") result = await togglePlaygroundBookmark(id, member);
    else if (action === "record_interaction") result = await recordPlaygroundMemberInteraction(id, member);
    else if (action === "create_comment") result = await createPlaygroundComment(id, member, payload.body, payload.parentId);
    else if (action === "toggle_comment_vote") result = await togglePlaygroundCommentVote(id, asString(payload.commentId, 100), member);
    else if (action === "toggle_comment_reaction" || action === "set_comment_marker") result = await togglePlaygroundCommentReaction(id, asString(payload.commentId, 100), payload.marker, member);
    else if (action === "toggle_comment_featured") result = await togglePlaygroundCommentFeatured(id, asString(payload.commentId, 100), member);
    else if (action === "transfer_ownership") result = await transferPlaygroundPost(id, member, payload.targetMemberId);
    else if (action === "set_comment_hidden") result = await setPlaygroundCommentHidden(id, asString(payload.commentId, 100), member, Boolean(payload.hidden));
    else if (action === "delete_comment") result = await deletePlaygroundCommentBranch(id, asString(payload.commentId, 100), member);
    else return Response.json({ message: "操作无效" }, { status: 400 });
    await publishSyncInvalidation([`/api/playground/${id}`, "/api/playground", "/api/admin/playground", "/api/members/", "/api/notifications"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "操作失败，请稍后重试");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    const result = await deletePlaygroundPost(id, member);
    await publishSyncInvalidation([`/api/playground/${id}`, "/api/playground", "/api/admin/playground", "/api/members/"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "删除失败，请稍后重试");
  }
}
