import { createPost, listPosts, type NewPost } from "@/lib/server/community";
import { handle, json, rateLimit, readJson, requireFlag, requireMember } from "@/lib/server/http";

export function GET(req: Request) {
  return handle(async () => {
    await requireFlag("community");
    const { uid } = await requireMember(req);
    const url = new URL(req.url);
    const posts = await listPosts(uid, url.searchParams.get("emd") ?? "", url.searchParams.get("category") ?? undefined);
    return json({ posts });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    await requireFlag("community");
    const { uid } = await requireMember(req);
    await rateLimit(`post:${uid}`, 10, 3600_000);
    const post = await createPost(uid, await readJson<NewPost>(req));
    return json({ post }, { status: 201 });
  });
}
