import { NextResponse } from "next/server";

import { createQuickRouterImageClient } from "@/lib/server/ai/quickrouter-image";
import { getDb } from "@/lib/server/db";
import {
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  getCourseResourcesAndAdvance,
  type CourseImageQueueDeps,
} from "@/lib/server/repositories/course-images";
import { downloadCourseImage } from "@/lib/server/storage/course-images";

// The image client validates config (API key) at construction. Build it lazily so simply reading Step 4 status
// never fails when the key is missing or the provider is misconfigured; only actual submit/query touches it.
function queueDeps(): CourseImageQueueDeps {
  let client: ReturnType<typeof createQuickRouterImageClient> | null = null;
  const getClient = () => (client ??= createQuickRouterImageClient());
  return {
    provider: {
      submit: (input) => getClient().submit(input),
      query: () => getClient().query(),
    },
    download: downloadCourseImage,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await getCourseResourcesAndAdvance(getDb(), id, queueDeps());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Resource status loading failed", error);
    return NextResponse.json({ message: "资源状态加载失败" }, { status: 500 });
  }
}
